import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Comments on report items (polymorphic — see migrations/032).
//   GET ?reportId=<id>                → all comments for a report (editor)
//   GET ?partnerShortName=<name>      → the partner's OUTSTANDING comments across
//                                       their reports AND project documents
//                                       (resolved ones are hidden —
//                                       once CRAF'd confirms, the partner is done
//                                       with it) + project/year context + a live
//                                       entry label (partner home feed)
//   POST   { reportId, section, itemId?, body, parentId? }  (author = authenticated user)
//   PATCH  { id, body?, resolved? }
//   DELETE ?id=<id>
//
// Threading: a comment with parent_id = NULL is top-level; one with parent_id set
// is a reply to it. Depth is capped at one level (a reply cannot be replied to) —
// enforced in POST below, not by a constraint, since a CHECK cannot inspect
// another row. Both admins and partners may post; author_role records which.

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
    `SELECT rm.id,
            concat_ws(' · ',
              NULLIF(rm.risk_name, ''),
              NULLIF((SELECT string_agg(rc.category, ', ' ORDER BY rc.category)
                        FROM reporting_platform.risk_categories rc
                       WHERE rc.risk_id = rm.id), '')) AS label
       FROM reporting_platform.risk_management rm WHERE rm.id = ANY($1)`,
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
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  const partnerShortName = req.nextUrl.searchParams.get("partnerShortName");
  const scope = req.nextUrl.searchParams.get("scope");

  // Cross-partner admin feed is admin-only; a partner may only read their own
  // report's comments or their own organization's feed.
  if (scope === "admin" && session.role !== "admin") {
    return NextResponse.json({ error: "You don't have access to this resource" }, { status: 403 });
  }
  if (reportId) {
    const gate = await guardReport(session, reportId);
    if (gate) return gate;
  }
  if (partnerShortName && session.role !== "admin" &&
      session.org?.toLowerCase() !== partnerShortName.toLowerCase()) {
    return NextResponse.json({ error: "You don't have access to this resource" }, { status: 403 });
  }

  try {
    if (scope === "admin") {
      // Every comment across all partners — reports AND project documents — with
      // context for the admin Comments tab. `data_type` lets the UI mark prodoc
      // comments as being on a project document. Live entry labels resolved like
      // the partner feed.
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.partner_addressed, c.created_at,
                c.parent_id, c.author, c.author_role,
                r.year, r.report_type, r.data_type,
                p.project_title,
                p.short_name  AS project_short_name,
                pt.short_name AS partner_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          ORDER BY c.created_at DESC`,
        []
      );
      return NextResponse.json(await withItemLabels(rows as CommentRow[]));
    }

    if (reportId) {
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.partner_addressed, c.author, c.created_at,
                c.parent_id, c.author_role,
                pt.short_name AS partner_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE c.report_id = $1
          ORDER BY c.created_at ASC`,
        [reportId]
      );
      return NextResponse.json(rows);
    }

    if (partnerShortName) {
      // Replies are excluded (parent_id IS NULL): the partner's own replies are
      // comments on their own project, so without this filter they would appear
      // in the partner's own to-do feed as items awaiting their attention.
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.partner_addressed, c.created_at,
                c.parent_id, c.author, c.author_role,
                r.year, r.report_type, r.data_type,
                p.project_title,
                p.short_name AS project_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE LOWER(pt.short_name) = LOWER($1)
            AND c.resolved = FALSE
            AND c.parent_id IS NULL
          ORDER BY c.partner_addressed ASC, c.created_at DESC`,
        [partnerShortName]
      );
      return NextResponse.json(await withItemLabels(rows as CommentRow[]));
    }

    return NextResponse.json({ error: "reportId or partnerShortName is required" }, { status: 400 });
  } catch (err) {
    logger.error("GET /api/comments error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
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
  const parentId = body.parentId == null ? null : Number(body.parentId);

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  // Replies are capped at one level, and a reply must belong to the same report
  // as its parent — otherwise a caller could attach a reply to a comment on a
  // report they cannot see, and it would surface there.
  if (parentId != null) {
    const parent = await query(
      `SELECT report_id, parent_id FROM reporting_platform.item_comments WHERE id = $1`,
      [parentId]
    ) as { report_id: number; parent_id: number | null }[];
    if (!parent.length) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 400 });
    }
    if (parent[0].parent_id != null) {
      return NextResponse.json({ error: "Replies cannot be replied to" }, { status: 400 });
    }
    if (parent[0].report_id !== reportId) {
      return NextResponse.json({ error: "Parent comment belongs to another report" }, { status: 400 });
    }
  }

  // Author and role are the authenticated identity, never taken from the request
  // body — otherwise any caller could post a comment attributed to someone else
  // ("CRAF'd Secretariat", another partner, etc.). session.name is the trusted
  // display name minted at login; session.role distinguishes admin from partner
  // reliably, which the display name cannot.
  const author = session.name;
  const authorRole = session.role;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.item_comments (report_id, section, item_id, body, author, author_role, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, report_id, section, item_id, body, resolved, partner_addressed, author, author_role, parent_id, created_at`,
      [reportId, section, itemId, text, author, authorRole, parentId]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/comments error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "item_comments", id);
  if (gate) return gate;

  // guardRow only establishes that the comment sits on a report this session can
  // reach — not that this session wrote it. Partners share one login per
  // organization, so "own" here means "written by this partner org", which is the
  // finest distinction the data supports.
  //   body            — a partner may edit only partner-authored comments
    //   resolved        — CRAF'd-side tick; currently unrestricted (flagged for Niroj)
  //   partner_addressed — partner-side tick, set on CRAF'd's comments; unrestricted
  if (session.role !== "admin") {
    const target = await query(
      `SELECT author_role FROM reporting_platform.item_comments WHERE id = $1`,
      [id]
    ) as { author_role: string | null }[];
    if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (typeof body.body === "string" && target[0].author_role !== "partner") {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }
  }

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
        RETURNING id, report_id, section, item_id, body, resolved, partner_addressed, author, author_role, parent_id, created_at`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/comments error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "item_comments", id);
  if (gate) return gate;

  // As in PATCH: a partner may delete only partner-authored comments, never
  // CRAF'd's. Deleting a top-level comment cascades to its replies (FK).
  if (session.role !== "admin") {
    const target = await query(
      `SELECT author_role FROM reporting_platform.item_comments WHERE id = $1`,
      [id]
    ) as { author_role: string | null }[];
    if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target[0].author_role !== "partner") {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }
  }

  try {
    await query(`DELETE FROM reporting_platform.item_comments WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/comments error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}