import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { workplanTypeCodeSql } from "@/lib/workplan";
import { countsTowardProgress } from "@/lib/report-sections";
import { getWordLimits } from "@/lib/word-limits";
import { wordCount } from "@/lib/word-count";
import { hasUpdateModuleColumns } from "@/lib/update-columns";
import { hasModule } from "@/lib/update-modules";

// Report completion, per section.
//
//   • `sections`      — { [sectionValue]: boolean } map used for sidebar checkmarks.
//   • `completed`     — number of progress-counting sections that are true.
//   • `totalSections` — number of progress-counting sections (all of them now,
//                       including Complementary).
//
// Transfers to Implementing Partners is part of the Budget tab, so it has no
// entry of its own: Budget ("expenditure") is complete only when the budget AND
// the transfers are — on reports always, on updates only when the update carries
// the Budget "+ transfers" add-on module.
//
// A section is "complete" only when it is actually filled out — an empty section
// is never complete (so the checkmark means "done", not "nothing to do").

type Row = Record<string, unknown>;
const n = (v: unknown) => Number((v as { toString: () => string })?.toString?.() ?? v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    const withModules = await hasUpdateModuleColumns();
    const meta = await query<{ project_id: number; data_type: string; update_modules: string[] | null }>(
      `SELECT project_id, data_type, ${withModules ? "update_modules" : "NULL::text[] AS update_modules"}
         FROM reporting_platform.reports WHERE id = $1`,
      [reportId]
    );
    if (meta.length === 0) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const { project_id: projectId, data_type: dataType, update_modules: updateModules } = meta[0];
    const includesTransfers = dataType !== "update" || hasModule(updateModules, "transfers");

    // A row-list section: complete when it has >= min filled rows and no empty ones.
    // `field` may be several columns: a row then counts as filled only when ALL are set.
    const listSection = (table: string, field: string | string[], min: number) => {
      const cols = Array.isArray(field) ? field : [field];
      const filledSql = cols.map((c) => `(${c} IS NOT NULL AND ${c} <> '')`).join(" AND ");
      return query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ${filledSql})::int AS filled
           FROM reporting_platform.${table} WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.filled) >= min && n(r[0]?.filled) === n(r[0]?.total));
    };

    const [
      overview, surveys, risk, indicators, transfers, complementary,
      achievements, partnerships, results, lessons, coverage,
      workplan, expenditure, testimonials,
    ] = await Promise.all([
      // Overview — complete when the partner has ticked the authorization checkbox.
      query<Row>(
        `SELECT authorized FROM reporting_platform.reports WHERE id = $1`,
        [reportId]
      ).then((r) => r[0]?.authorized === true),

      // Surveys — every question assessed and its context filled in.
      query<Row>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE assessment IS NOT NULL AND btrim(COALESCE(context, '')) <> '')::int AS ok
           FROM reporting_platform.surveys WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Risk — every risk is complete (and there is at least one):
      //   • added in this report (source_risk_id NULL): updated likelihood + impact entered;
      //   • carried over: it answered "Since the last report, this risk…" (risk_status) —
      //       unchanged → complete (values are copied from the previous report);
      //       changed   → updated likelihood + impact + mitigation entered;
      //       happened  → updated impact + a mitigation (what happened / what was done).
      // Uses updated_* (not the approved ProDoc columns). No status yet = incomplete.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE
                     (source_risk_id IS NULL AND updated_likelihood IS NOT NULL AND updated_impact IS NOT NULL)
                  OR risk_status = 'unchanged'
                  OR (risk_status = 'changed' AND updated_likelihood IS NOT NULL AND updated_impact IS NOT NULL AND NULLIF(TRIM(updated_mitigation), '') IS NOT NULL)
                  OR (risk_status = 'happened' AND updated_impact IS NOT NULL AND NULLIF(TRIM(updated_mitigation), '') IS NOT NULL)
                )::int AS ok
           FROM reporting_platform.risk_management WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Indicators — every line has an achieved value + status.
      // Mirrors the reportFilter in GET /api/indicator-data: for annual reports
      // only count rows whose indicator is on the project document, because
      // orphaned rows (from indicators removed from the prodoc) are never shown
      // on the Indicators tab and the partner has no way to fill them in.
      query<Row>(
        dataType === "report"
          ? `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE achieved_value IS NOT NULL AND achieved_value <> '' AND status IS NOT NULL)::int AS ok
               FROM reporting_platform.indicator_data
              WHERE report_id = $1
                AND indicator_id IN (
                      SELECT pd.indicator_id
                        FROM reporting_platform.indicator_data pd
                        JOIN reporting_platform.reports prodoc ON prodoc.id = pd.report_id
                       WHERE prodoc.project_id = $2
                         AND prodoc.data_type = 'prodoc'
                    )`
          : `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE achieved_value IS NOT NULL AND achieved_value <> '' AND status IS NOT NULL)::int AS ok
               FROM reporting_platform.indicator_data WHERE report_id = $1`,
        dataType === "report" ? [reportId, projectId] : [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Transfers — complete when there is at least one row and every row has the
      // partner selected and the amount filled, OR there are zero rows and the
      // partner ticked "No transfers to report" (reports.no_transfers_confirmed).
      // Zero rows without the flag is NOT complete.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE tp.organization_name IS NOT NULL AND tp.organization_name <> ''
                                   AND d.amount_transferred IS NOT NULL)::int AS ok,
                (SELECT no_transfers_confirmed FROM reporting_platform.reports WHERE id = $1) AS confirmed
           FROM reporting_platform.transfer_data d
           JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
          WHERE d.report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 ? n(r[0]?.ok) === n(r[0]?.total) : r[0]?.confirmed === true),

      // Complementary — same rule: every row has the contributor selected and the
      // amount filled, OR zero rows and "No complementary funding to report" ticked
      // (reports.no_complementary_confirmed).
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE c.contributor_name IS NOT NULL AND c.contributor_name <> ''
                                   AND cd.contribution_amount IS NOT NULL)::int AS ok,
                (SELECT no_complementary_confirmed FROM reporting_platform.reports WHERE id = $1) AS confirmed
           FROM reporting_platform.complementary_data cd
           JOIN reporting_platform.complementary_contributors c ON c.id = cd.contributor_id
          WHERE cd.report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 ? n(r[0]?.ok) === n(r[0]?.total) : r[0]?.confirmed === true),

      listSection("key_achievements", "achievement", 1),
      listSection("partnerships", "partner_organization", 1),
      listSection("results", "context", 3),
      // Lessons learned: category, lesson learned and adjustment informed are ALL required per row.
      listSection("lessons_learned", ["category", "lesson_learned", "adjustment_informed"], 1),
      listSection("external_coverage", "description", 3),

      // Workplan — every activity has a progress status in this report's own window
      // (the AR or FR row whose year and type_code match the report). No matching
      // window ⇒ incomplete.
      query<Row>(
               `SELECT (SELECT COUNT(*) FROM reporting_platform.workplan_activities WHERE project_id = $1)::int AS activities,
                (SELECT COUNT(*) FROM reporting_platform.workplan_activities a
                   JOIN reporting_platform.workplan_entries e ON e.activity_id = a.id
                   JOIN reporting_platform.workplan_updates wu ON wu.id = e.update_id AND wu.project_id = $1
                   JOIN reporting_platform.reports r ON r.id = $2
                  WHERE a.project_id = $1
                    AND wu.year = r.year
                    AND wu.type_code = ${workplanTypeCodeSql("r")}
                    AND e.status IS NOT NULL)::int AS done`,
        [projectId, reportId]
      ).then((r) => n(r[0]?.activities) > 0 && n(r[0]?.done) === n(r[0]?.activities)),

      // Expenditure — complete when at least one category has an annual expenditure
      // above 0 for this report (blank amounts count as 0, so a report with nothing
      // entered is not complete).
      query<Row>(
        `SELECT EXISTS (SELECT 1 FROM reporting_platform.expenditure_entries
                         WHERE report_id = $1 AND annual_expenditure > 0) AS ok`,
        [reportId]
      ).then((r) => !!r[0]?.ok),

      // Testimonials — a leadership row must have quote, person_name and
      // person_title filled. Partner/user quotes are optional, but no
      // started-but-incomplete row of either kind is allowed; and every photo
      // must have caption and credits.
      // "Photos from Project Implementation" (kind='ground') are optional, but a started entry
      // needs its description & caption and at least one photo; like every
      // testimonial photo, each needs a caption and credits.
      query<Row>(
        `SELECT EXISTS (SELECT 1 FROM reporting_platform.testimonials
                         WHERE report_id = $1 AND kind = 'leadership'
                           AND COALESCE(trim(quote), '') <> ''
                           AND COALESCE(trim(person_name), '') <> ''
                           AND COALESCE(trim(person_title), '') <> '') AS leadership_ok,
               NOT EXISTS (
                 SELECT 1 FROM reporting_platform.testimonials
                  WHERE report_id = $1
                    AND kind IN ('leadership', 'partner')
                    AND (COALESCE(trim(quote), '') <> '' OR COALESCE(trim(person_name), '') <> '' OR COALESCE(trim(person_title), '') <> '')
                    AND (COALESCE(trim(quote), '') = '' OR COALESCE(trim(person_name), '') = '' OR COALESCE(trim(person_title), '') = '')
               ) AS fields_ok,
               NOT EXISTS (
                 SELECT 1 FROM reporting_platform.testimonials t
                  WHERE t.report_id = $1
                    AND t.kind = 'ground'
                    -- started: anything filled in or attached …
                    AND (COALESCE(trim(t.quote), '') <> ''
                         OR EXISTS (SELECT 1 FROM reporting_platform.testimonial_photos p WHERE p.testimonial_id = t.id))
                    -- … but not complete
                    AND (COALESCE(trim(t.quote), '') = ''
                         OR NOT EXISTS (SELECT 1 FROM reporting_platform.testimonial_photos p WHERE p.testimonial_id = t.id))
               ) AS ground_ok,
               NOT EXISTS (
                 SELECT 1
                   FROM reporting_platform.testimonial_photos p
                   JOIN reporting_platform.testimonials t ON t.id = p.testimonial_id
                  WHERE t.report_id = $1
                    AND (COALESCE(trim(p.photo_label), '') = '' OR COALESCE(trim(p.photo_credits), '') = '')
               ) AS photos_ok`,
        [reportId]
      ).then((r) => r[0]?.leadership_ok === true &&r[0]?.fields_ok === true && r[0]?.ground_ok === true && r[0]?.photos_ok === true),
    ]);

    // ── Word limits ──────────────────────────────────────────────────────────
    // A section is also incomplete when ANY limited text in it is over its word limit —
    // optional columns included (significance, survey context, indicator / workplan /
    // expenditure comment, …). Counted in JS after selecting the text columns.
    const wl = await getWordLimits();
    const anyOver = (rows: Row[], cols: Record<string, string>) =>
      rows.some((row) => Object.entries(cols).some(([col, key]) => wordCount(row[col] as string | null) > wl.limit(key)));
    const overIn = (sql: string, params: unknown[], cols: Record<string, string>) =>
      query<Row>(sql, params).then((rows) => anyOver(rows, cols));
    // Tables that may not exist on every database (HACT, justifications): treat as within limits.
    const overInSafe = (sql: string, params: unknown[], cols: Record<string, string>) =>
      overIn(sql, params, cols).catch(() => false);
    const listOver = (table: string, cols: Record<string, string>) =>
      overIn(`SELECT ${Object.keys(cols).join(", ")} FROM reporting_platform.${table} WHERE report_id = $1`, [reportId], cols);

    const [
      surveysOver, riskOver, indicatorsOver, achievementsOver, partnershipsOver, resultsOver,
      lessonsOver, coverageOver, workplanOver, expenditureOver, testimonialsOver, hactOver, justificationOver,
    ] = await Promise.all([
      listOver("surveys", { context: "surveys.context" }),
      // risk_description only counts for risks added in this report: carried-over risks
      // keep the ProDoc's description, which the partner can't edit.
      overIn(
        `SELECT CASE WHEN source_risk_id IS NULL THEN risk_description END AS risk_description, updated_mitigation
           FROM reporting_platform.risk_management WHERE report_id = $1`,
        [reportId],
        { risk_description: "risk_management.risk_description", updated_mitigation: "risk_management.updated_mitigation" }
      ),
      overIn(
        dataType === "report"
          ? `SELECT comment FROM reporting_platform.indicator_data
              WHERE report_id = $1
                AND indicator_id IN (
                      SELECT pd.indicator_id
                        FROM reporting_platform.indicator_data pd
                        JOIN reporting_platform.reports prodoc ON prodoc.id = pd.report_id
                       WHERE prodoc.project_id = $2 AND prodoc.data_type = 'prodoc')`
          : `SELECT comment FROM reporting_platform.indicator_data WHERE report_id = $1`,
        dataType === "report" ? [reportId, projectId] : [reportId],
        { comment: "indicator_data.comment" }
      ),
      listOver("key_achievements", { achievement: "key_achievements.achievement", significance: "key_achievements.significance" }),
      listOver("partnerships", { result: "partnerships.result" }),
      listOver("results", { context: "results.context", data_driven_decision: "results.data_driven_decision", resulting_impact: "results.resulting_impact" }),
      listOver("lessons_learned", { lesson_learned: "lessons_learned.lesson_learned", adjustment_informed: "lessons_learned.adjustment_informed" }),
      listOver("external_coverage", { description: "external_coverage.description", reach_indicator: "external_coverage.reach_indicator" }),
      // The report's own work plan window (same match as the Workplan rule above).
      overIn(
        `SELECT e.comment
           FROM reporting_platform.workplan_entries e
           JOIN reporting_platform.workplan_updates wu ON wu.id = e.update_id AND wu.project_id = $1
           JOIN reporting_platform.reports r ON r.id = $2
          WHERE wu.year = r.year AND wu.type_code = ${workplanTypeCodeSql("r")}`,
        [projectId, reportId],
        { comment: "workplan_entries.comment" }
      ),
      listOver("expenditure_entries", { comment: "expenditure_entries.comment" }),
      query<Row>(`SELECT kind, quote FROM reporting_platform.testimonials WHERE report_id = $1`, [reportId]).then((rows) =>
        rows.some((t) => {
          const key =
            t.kind === "leadership" ? "testimonials.leadership_quote"
            : t.kind === "partner" ? "testimonials.partner_quote"
            : t.kind === "ground" ? "testimonials.ground_description"
            : null;
          return key !== null && wordCount(t.quote as string | null) > wl.limit(key);
        })
      ),
      // HACT and Justification only exist on project updates.
      dataType === "update"
        ? overInSafe(`SELECT partner_comment FROM reporting_platform.hact_recommendations WHERE project_id = $1`, [projectId], { partner_comment: "hact_recommendations.partner_comment" })
        : Promise.resolve(false),
      dataType === "update"
        ? overInSafe(`SELECT justification FROM reporting_platform.update_justifications WHERE report_id = $1`, [reportId], { justification: "update_justifications.justification" })
        : Promise.resolve(false),
    ]);

    const sections: Record<string, boolean> = {
      overview,
      surveys: surveys && !surveysOver,
      achievements: achievements && !achievementsOver,
      partnerships: partnerships && !partnershipsOver,
      results: results && !resultsOver,
      lessons: lessons && !lessonsOver,
      "external-coverage": coverage && !coverageOver,
      risk: risk && !riskOver,
      indicators: indicators && !indicatorsOver,
      workplan: workplan && !workplanOver,
      expenditure: expenditure && !expenditureOver && (!includesTransfers || transfers),
      complementary,
      testimonials: testimonials && !testimonialsOver,
      // Project updates only: complete unless over the word limit (no other rule).
      ...(dataType === "update" ? { hact: !hactOver, justification: !justificationOver } : {}),
    };

    // The progress figures use countsTowardProgress (currently every section);
    // `sections` itself carries every section for ticks and submit blocking.
    const counted = Object.entries(sections).filter(([key]) => countsTowardProgress(key));
    const completed = counted.filter(([, ok]) => ok).length;
    const totalSections = counted.length;

    return NextResponse.json({ sections, completed, totalSections });
  } catch (err) {
    logger.error("GET /api/report-completion error:", err);
    return NextResponse.json({ error: "Failed to load completion" }, { status: 500 });
  }
}
