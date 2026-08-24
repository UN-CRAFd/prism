import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Consolidated prodoc data for the print/PDF view. Returns every section of a
// project document in one payload so the print page can render it in one pass.
//   GET /api/reports/[id]/prodoc-export  (id = the prodoc's reports.id)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    const gate = await guardReport(session, id);
    if (gate) return gate;

    const metaRows = await query<Record<string, unknown>>(
      `SELECT
         r.id, r.year, r.data_type,
         p.id                                            AS project_id,
         p.project_title, p.short_name AS project_short_name,
         p.description, p.status,
         p.mptfo_project_number, p.grant_size_usd, p.geographic_scope,
         COALESCE(
           (SELECT json_agg(json_build_object('id', po.id, 'name', po.name) ORDER BY po.sort_order, po.id)
              FROM reporting_platform.project_organizations po
             WHERE po.project_id = p.id AND po.type = 'participating'),
           '[]'::json
         ) AS participating_organizations,
         COALESCE(
           (SELECT json_agg(json_build_object('id', po.id, 'name', po.name) ORDER BY po.sort_order, po.id)
              FROM reporting_platform.project_organizations po
             WHERE po.project_id = p.id AND po.type = 'implementing'),
           '[]'::json
         ) AS implementing_partners,
         p.indirect_cost_rate,
         TO_CHAR(p.project_start_date, 'YYYY-MM-DD')     AS project_start_date,
         p.project_duration_months,
         TO_CHAR(reporting_platform.project_end_date(p.project_start_date, p.project_duration_months), 'YYYY-MM-DD') AS project_end_date,
         reporting_platform.project_year_range(p.project_start_date, p.project_duration_months) AS years,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name,
         pt.organization_website
       FROM reporting_platform.reports r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.id = $1`,
      [id]
    );

    if (metaRows.length === 0) {
      return NextResponse.json({ error: "Project document not found" }, { status: 404 });
    }
    const meta = metaRows[0];
    const projectId = meta.project_id as number;

    const [narratives, risks, indicators, activities, budgets, signatureContacts, secretariatSig, sdgTargets] = await Promise.all([
      query(
        `SELECT narrative_key, label, answer
           FROM reporting_platform.project_narratives
          WHERE project_id = $1 AND answer IS NOT NULL AND answer <> ''
          ORDER BY sort_order, id`,
        [projectId]
      ),
      query(
        `SELECT rm.risk_name, rm.likelihood, rm.impact, rm.approved_mitigation,
                COALESCE(
                  (SELECT ARRAY_AGG(rc.category ORDER BY rc.category)
                     FROM reporting_platform.risk_categories rc
                    WHERE rc.risk_id = rm.id),
                  '{}'
                ) AS categories
           FROM reporting_platform.risk_management rm
          WHERE rm.report_id = $1
          ORDER BY rm.id`,
        [id]
      ),
      query(
        `SELECT i.name AS indicator_name, i.description AS indicator_description,
                i.category,
                d.baseline_value, d.baseline_year, d.target_value, d.target_year
           FROM reporting_platform.indicator_data d
           JOIN reporting_platform.indicators i ON i.id = d.indicator_id
          WHERE d.report_id = $1
          ORDER BY d.sort_order, d.id`,
        [id]
      ),
      query(
        `SELECT outcome, objective_num, objective_text, activity_num, activity_text,
                implementing_agent, planned_quarters
           FROM reporting_platform.workplan_activities
          WHERE project_id = $1
          ORDER BY sort_order, id`,
        [projectId]
      ),
      query(
        `SELECT ec.name AS category_name, ec.sort_order, eb.year, eb.approved_amount, eb.description
           FROM reporting_platform.expenditure_budgets eb
           JOIN reporting_platform.expenditure_categories ec ON ec.id = eb.category_id
          WHERE eb.project_id = $1
          ORDER BY ec.sort_order, eb.year`,
        [projectId]
      ),
      // Signature slots: every project contact, with its signature date if signed.
      query(
        `SELECT pc.name, pc.role, jc.relationship,
                TO_CHAR(sig.signed_at, 'YYYY-MM-DD') AS signed_at
           FROM reporting_platform.project_contacts jc
           JOIN reporting_platform.partner_contacts pc ON pc.id = jc.contact_id
           LEFT JOIN reporting_platform.prodoc_signatures sig
             ON sig.project_id = jc.project_id
            AND sig.party = 'contact'
            AND sig.contact_id = jc.contact_id
          WHERE jc.project_id = $1
          ORDER BY jc.sort_order, pc.name`,
        [projectId]
      ),
      query(
        `SELECT TO_CHAR(signed_at, 'YYYY-MM-DD') AS signed_at
           FROM reporting_platform.prodoc_signatures
          WHERE project_id = $1 AND party = 'secretariat'
          LIMIT 1`,
        [projectId]
      ),
      query(
        `SELECT sdg_goal, target_code, percentage, priority
           FROM reporting_platform.project_sdg_targets
          WHERE project_id = $1
          ORDER BY (priority = 'secondary'), sdg_goal, target_code`,
        [projectId]
      ),
    ]);

    const signatures = {
      contacts: signatureContacts as { name: string; role: string | null; relationship: string | null; signed_at: string | null }[],
      secretariat: { signed_at: (secretariatSig[0] as { signed_at: string } | undefined)?.signed_at ?? null },
    };

    return NextResponse.json({ meta, narratives, risks, indicators, activities, budgets, signatures, sdgTargets });
  } catch (err) {
    logger.error("GET /api/reports/[id]/prodoc-export error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
