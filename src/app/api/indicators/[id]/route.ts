import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, requireSession, resolvePartnerId } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { isValidCycle } from "@/lib/indicators";
import { editableStatusParam } from "@/lib/report-status";

const ALLOWED_FIELDS = [
  "name",
  "description",
  "means_of_verification",
  "category",
  "cycle",
] as const;

// PUT /api/indicators/[id] — partial update of a library indicator.
// Admins may edit any indicator. Partners may edit CUSTOM indicators only, and
// only name, description, means_of_verification and cycle.
//
// Custom indicators belong to one project. A partner edit carries `reportId`
// (the document being edited) and is resolved against that document's project:
//   • every use of the indicator is in this project's partner-editable documents
//     → the indicator is edited in place;
//   • it is also used elsewhere (another project, or a document no longer
//     editable) → a project-specific copy is created with the edits applied, and
//     this project's editable documents are re-pointed to it. Other projects and
//     submitted documents keep the original untouched. The response then carries
//     `copied_from` (the original id) so the client can swap the id.
// Without `reportId` the old rule applies: every use must be in documents the
// partner may edit, otherwise 403.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    // Standard indicators are admin-only; custom ones are checked for ownership
    // below. Always check the DB value — never trust the request body.
    const indicator = await query<{ is_standard: boolean; description: string | null; means_of_verification: string | null }>(
      `SELECT is_standard, description, means_of_verification FROM reporting_platform.indicators WHERE id = $1`,
      [id]
    );
    if (indicator.length === 0) {
      return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    }
    if (indicator[0].is_standard && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rawBody = await request.json();
    // `reportId` is context (which document the edit came from), not a field.
    const { reportId: rawReportId, ...body } = rawBody ?? {};
    const reportId = rawReportId == null ? null : Number(rawReportId);
    if (reportId != null && !Number.isInteger(reportId)) {
      return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
    }

    // Partner edits resolve to either an in-place update or a project copy.
    let copyForProject: number | null = null;
    if (session.role !== "admin") {
      const partnerId = await resolvePartnerId(session);
      if (partnerId == null) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // The project the edit belongs to — must be one the partner may edit.
      let projectId: number | null = null;
      if (reportId != null) {
        const proj = await query<{ project_id: number }>(
          `SELECT p.id AS project_id
             FROM reporting_platform.reports r
             JOIN reporting_platform.projects p ON p.id = r.project_id
            WHERE r.id = $1
              AND (p.partner_id = $2
                   OR EXISTS (SELECT 1 FROM reporting_platform.project_editors pe
                               WHERE pe.project_id = p.id AND pe.partner_id = $2))`,
          [reportId, partnerId]
        );
        if (proj.length === 0) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        projectId = proj[0].project_id;
      }
      const usage = await query<{ total: number; allowed: number; here: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (
                  WHERE r.status = ANY($3::text[])
                    AND (p.partner_id = $2
                         OR EXISTS (SELECT 1 FROM reporting_platform.project_editors pe
                                     WHERE pe.project_id = p.id AND pe.partner_id = $2))
                )::int AS allowed,
                -- uses in this project's editable documents (what a copy would take over)
                COUNT(*) FILTER (
                  WHERE r.status = ANY($3::text[]) AND p.id = $4
                )::int AS here
           FROM reporting_platform.indicator_data d
           JOIN reporting_platform.reports  r ON r.id = d.report_id
           JOIN reporting_platform.projects p ON p.id = r.project_id
          WHERE d.indicator_id = $1`,
        [id, partnerId, editableStatusParam(), projectId]
      );
      const { total, allowed, here } = usage[0];
      if (projectId != null) {
        // Not used in an editable document of this project → nothing to edit.
        if (here === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        // Used anywhere else → copy instead of changing other projects' indicator.
        if (here !== total) copyForProject = projectId;
      } else if (total === 0 || allowed !== total) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (session.role !== "admin") {
      const PARTNER_FIELDS = ["name", "description", "means_of_verification", "cycle"];
      const notAllowed = Object.keys(body).filter((k) => !PARTNER_FIELDS.includes(k));
      if (notAllowed.length) {
        return NextResponse.json({ error: `Not allowed to edit: ${notAllowed.join(", ")}` }, { status: 403 });
      }
    }
    if ("name" in body && (typeof body.name !== "string" || body.name.trim() === "")) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    for (const f of ["description", "means_of_verification"]) {
      if (f in body && body[f] !== null && typeof body[f] !== "string") {
        return NextResponse.json({ error: `${f} must be text` }, { status: 400 });
      }
    }

    if ("cycle" in body && !isValidCycle(body.cycle)) {
      return NextResponse.json({ error: "Invalid cycle" }, { status: 400 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (!(field in body)) continue;
      const val = body[field];
      setClauses.push(`${field} = $${idx++}`);
      values.push(field === "name" ? String(val).trim() : val || null);
    }

    // is_standard: admin-only reclassification. Kept out of ALLOWED_FIELDS because
    // the val || null coercion there would turn false into null.
    if ("is_standard" in body) {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const newIsStandard = Boolean(body.is_standard);
      // Demoting to custom requires both description and means_of_verification.
      // Use the incoming value if present, otherwise fall back to the stored value.
      if (!newIsStandard) {
        const effectiveDesc = "description" in body
          ? (typeof body.description === "string" ? body.description.trim() : "")
          : (indicator[0].description ?? "");
        const effectiveMov = "means_of_verification" in body
          ? (typeof body.means_of_verification === "string" ? body.means_of_verification.trim() : "")
          : (indicator[0].means_of_verification ?? "");
        if (!effectiveDesc) {
          return NextResponse.json({ error: "description is required when demoting to custom" }, { status: 400 });
        }
        if (!effectiveMov) {
          return NextResponse.json({ error: "means_of_verification is required when demoting to custom" }, { status: 400 });
        }
      }
      setClauses.push(`is_standard = $${idx++}`);
      values.push(newIsStandard);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (copyForProject != null) {
      // One statement, so the copy and the re-pointing succeed or fail together.
      // The copy takes the edited values and the original's other columns; it is
      // always custom. Only this project's editable documents move to it.
      const assigned = new Map<string, string>();
      setClauses.forEach((c) => { const [col, ph] = c.split(" = "); assigned.set(col, ph); });
      const cols = ["name", "description", "means_of_verification", "category", "cycle"];
      const select = cols.map((c) => assigned.get(c) ?? `o.${c}`).join(", ");
      values.push(id, copyForProject, editableStatusParam());
      const idIdx = idx, projIdx = idx + 1, statusIdx = idx + 2;
      const copied = await query(
        `WITH copy AS (
           INSERT INTO reporting_platform.indicators (${cols.join(", ")}, is_standard)
           SELECT ${select}, FALSE
             FROM reporting_platform.indicators o
            WHERE o.id = ${idIdx}
           RETURNING id, name, description, means_of_verification, category, cycle,
                     is_standard, archived_at, created_at, updated_at
         ), moved AS (
           UPDATE reporting_platform.indicator_data d
              SET indicator_id = (SELECT id FROM copy)
             FROM reporting_platform.reports r
            WHERE r.id = d.report_id
              AND d.indicator_id = ${idIdx}
              AND r.project_id = ${projIdx}
              AND r.status = ANY(${statusIdx}::text[])
           RETURNING d.id
         )
         SELECT copy.*, (SELECT COUNT(*) FROM moved)::int AS moved_lines FROM copy`,
        values
      );
      if (copied.length === 0) {
        return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
      }
      return NextResponse.json({ ...copied[0], copied_from: Number(id) });
    }

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.indicators SET ${setClauses.join(", ")}
        WHERE id = $${idx}
        RETURNING id, name, description, means_of_verification, category, cycle,
                  is_standard, archived_at, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PUT /api/indicators/[id] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

// DELETE /api/indicators/[id]
//   ?restore=1 → un-archive.
//   otherwise  → if any report data still references it, soft-delete (archive) so
//                historical lines survive (FK is ON DELETE RESTRICT); if it is
//                used nowhere, remove the row entirely.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;

    const restore = new URL(request.url).searchParams.get("restore") === "1";

    if (restore) {
      const rows = await query(
        `UPDATE reporting_platform.indicators SET archived_at = NULL
          WHERE id = $1 RETURNING id, archived_at`,
        [id]
      );
      if (rows.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
      return NextResponse.json({ ok: true, archived_at: rows[0].archived_at });
    }

    const usage = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.indicator_data WHERE indicator_id = $1`,
      [id]
    );

    // Not used anywhere → delete outright (no FK to block it).
    if (Number(usage[0]?.count ?? 0) === 0) {
      const del = await query(
        `DELETE FROM reporting_platform.indicators WHERE id = $1 RETURNING id`,
        [id]
      );
      if (del.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Still referenced → archive.
    const rows = await query(
      `UPDATE reporting_platform.indicators SET archived_at = NOW()
        WHERE id = $1 RETURNING id, archived_at`,
      [id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: false, archived_at: rows[0].archived_at });
  } catch (err) {
    logger.error("DELETE /api/indicators/[id] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
