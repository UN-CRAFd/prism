import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Admin comments on report items (polymorphic — see migrations/032).
//   GET ?reportId=<id>                → all comments for a report (editor)
//   GET ?partnerShortName=<name>      → the partner's OUTSTANDING comments across
//                                       their reports (resolved ones are hidden —
//                                       once CRAF'd confirms, the partner is done
//                                       with it) + project/year context + a live
//                                       entry label (partner home feed)
//   POST   { reportId, section, itemId?, body, author? }
//   PATCH  { id, body?, resolved? }
//   DELETE ?id=<id>

// A comment's (section, item_id) is a soft foreign key into whichever section
// table the entry lives in. To show "what the comment is about" in the feed we
// resolve that entry's data line live, so it always reflects the current row.
// Each query takes an int[] of ids and returns { id, label }. item_id is the PK
// of the listed table except indicators, where it is indicator_data.id joined to
// the indicator's name. Sections absent here (e.g. overview) have no per-item label.
const SECTION_ITEM_LABEL_SQL: Record<string, string> = {
  surveys:
    `SELECT id, question AS label FROM reporting_platform.surveys WHERE id = ANY($1)`,
  risk:
    `SELECT id, concat_ws(' · ', NULLIF(risk_name, ''), NULLIF(array_to_string(risk_category, ', '), '')) AS label
       FROM reporting_platform.risk_management WHERE id = ANY($1)`,
  indicators:
    `SELECT d.id, i.name AS label
       FROM reporting_platform.indicator_data d
       JOIN reporting_platform.indicators i ON i.id = d.indicator_id
      WHERE d.id = ANY($1)`,
  transfers:
    `SELECT id, organization_name AS label FROM reporting_platform.transfer_partners WHERE id = ANY($1)`,
  complementary:
    `SELECT id, contributor_name AS label FROM reporting_platform.complementary_contributors WHERE id = ANY($1)`,
  achievements:
    `SELECT id, concat_ws(' · ', NULLIF(achievement, ''), NULLIF(significance, '')) AS label
       FROM reporting_platform.key_achievements WHERE id = ANY($1)`,
  partnerships:
    `SELECT id, concat_ws(' · ', NULLIF(partner_organization, ''), NULLIF(result, '')) AS label
       FROM reporting_platform.partnerships WHERE id = ANY($1)`,
  results:
    `SELECT id, concat_ws(' · ', NULLIF(context, ''), NULLIF(data_driven_decision, ''), NULLIF(resulting_impact, '')) AS label
       FROM reporting_platform.results WHERE id = ANY($1)`,
  lessons:
    `SELECT id, concat_ws(' · ', NULLIF(category, ''), NULLIF(lesson_learned, ''), NULLIF(adjustment_informed, '')) AS label
       FROM reporting_platform.lessons_learned WHERE id = ANY($1)`,
  "external-coverage":
    `SELECT id, concat_ws(' · ', NULLIF(type, ''), NULLIF(description, ''), NULLIF(reach_indicator, '')) AS label
       FROM reporting_platform.external_coverage WHERE id = ANY($1)`,
  testimonials:
    `SELECT id, concat_ws(' · ', NULLIF(quote, ''), NULLIF(person_name, ''), NULLIF(person_title, '')) AS label
       FROM reporting_platform.testimonials WHERE id = ANY($1)`,
};

interface CommentRow { section: string; item_id: number | null; [k: string]: unknown }

// Attaches a live `item_label` to each comment by looking its entry up in the
// section's source table. One query per distinct section keeps it to a handful
// of round-trips regardless of comment count.
async function withItemLabels<T extends CommentRow>(rows: T[]): Promise<(T & { item_label: string | null })[]> {
  const idsBySection = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.item_id == null || !SECTION_ITEM_LABEL_SQL[r.section]) continue;
    (idsBySection.get(r.section) ?? idsBySection.set(r.section, new Set()).get(r.section)!).add(r.item_id);
  }

  const labels = new Map<string, string>(); // `${section}:${id}` → label
  await Promise.all(
    [...idsBySection].map(async ([section, ids]) => {
      const labelRows = await query(SECTION_ITEM_LABEL_SQL[section], [[...ids]]) as { id: number; label: string | null }[];
      for (const lr of labelRows) {
        if (lr.label) labels.set(`${section}:${lr.id}`, lr.label);
      }
    })
  );

  return rows.map((r) => ({
    ...r,
    item_label: r.item_id == null ? null : (labels.get(`${r.section}:${r.item_id}`) ?? null),
  }));
}

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const partnerShortName = req.nextUrl.searchParams.get("partnerShortName");
  const scope = req.nextUrl.searchParams.get("scope");

  try {
    if (scope === "admin") {
      // Every report comment across all partners, with context for the admin
      // Comments tab. Live entry labels resolved like the partner feed.
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.partner_addressed, c.created_at,
                r.year, r.report_type,
                p.project_title,
                p.short_name  AS project_short_name,
                pt.short_name AS partner_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE r.data_type = 'report'
          ORDER BY c.created_at DESC`,
        []
      );
      return NextResponse.json(await withItemLabels(rows as CommentRow[]));
    }

    if (reportId) {
      const rows = await query(
        `SELECT id, report_id, section, item_id, body, resolved, partner_addressed, author, created_at
           FROM reporting_platform.item_comments
          WHERE report_id = $1
          ORDER BY created_at ASC`,
        [reportId]
      );
      return NextResponse.json(rows);
    }

    if (partnerShortName) {
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.partner_addressed, c.created_at,
                r.year, r.report_type,
                p.project_title,
                p.short_name AS project_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE r.data_type = 'report'
            AND LOWER(pt.short_name) = LOWER($1)
            AND c.resolved = FALSE
          ORDER BY c.partner_addressed ASC, c.created_at DESC`,
        [partnerShortName]
      );
      return NextResponse.json(await withItemLabels(rows as CommentRow[]));
    }

    return NextResponse.json({ error: "reportId or partnerShortName is required" }, { status: 400 });
  } catch (err) {
    console.error("GET /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const reportId = Number(body.reportId);
  const section = typeof body.section === "string" ? body.section : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!reportId || !section || !text) {
    return NextResponse.json({ error: "reportId, section and body are required" }, { status: 400 });
  }
  const itemId = body.itemId == null ? null : Number(body.itemId);
  const author = typeof body.author === "string" ? body.author : null;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.item_comments (report_id, section, item_id, body, author)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, report_id, section, item_id, body, resolved, partner_addressed, author, created_at`,
      [reportId, section, itemId, text, author]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (typeof body.body === "string") { sets.push(`body = $${i++}`); values.push(body.body.trim()); }
  if (typeof body.resolved === "boolean") { sets.push(`resolved = $${i++}`); values.push(body.resolved); }
  if (typeof body.partner_addressed === "boolean") { sets.push(`partner_addressed = $${i++}`); values.push(body.partner_addressed); }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  values.push(id);
  try {
    const rows = await query(
      `UPDATE reporting_platform.item_comments SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING id, report_id, section, item_id, body, resolved, partner_addressed, author, created_at`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.item_comments WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
