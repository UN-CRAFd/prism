import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject, guardProjectRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import {
  DOCUMENT_TYPES, MAX_DOC_BYTES, MAX_DOC_MB, isAllowedDocExtension,
} from "@/lib/documents";

// Project documents / annexes uploaded against a project's project document.
// Project-scoped; file bytes stored in the project_documents.content bytea column.
//
//   GET    ?project_id=X           → metadata list (never returns content)
//   POST   multipart/form-data     → { project_id, doc_type, doc_date?, file }
//   PATCH  { id, doc_type?, doc_date? }  → edit metadata only
//   DELETE ?id=                    → remove a document
//
// The file itself is fetched by the single-file download route
// (src/app/api/project-documents/[id]/route.ts).

// Columns returned to the client — deliberately EXCLUDES `content`.
const META_COLS =
  "id, project_id, doc_type, doc_date, file_name, mime_type, size_bytes, uploaded_by, created_at";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT ${META_COLS}
         FROM reporting_platform.project_documents
        WHERE project_id = $1
        ORDER BY doc_date DESC NULLS LAST, created_at DESC, id DESC`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const projectId = form.get("project_id");
  const docType = typeof form.get("doc_type") === "string" ? (form.get("doc_type") as string) : "";
  const docDateRaw = form.get("doc_date");
  const docDate = typeof docDateRaw === "string" && docDateRaw.trim() ? docDateRaw.trim() : null;
  const file = form.get("file");

  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!DOCUMENT_TYPES.includes(docType as (typeof DOCUMENT_TYPES)[number])) {
    return NextResponse.json({ error: "A valid document type is required" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!isAllowedDocExtension(file.name)) {
    return NextResponse.json({ error: "That file type is not allowed" }, { status: 400 });
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${MAX_DOC_MB} MB limit` }, { status: 400 });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId as string);
  if (gate) return gate;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedBy = session.org || (session.role === "admin" ? "Administrator" : null);
    const rows = await query(
      `INSERT INTO reporting_platform.project_documents
         (project_id, doc_type, doc_date, file_name, mime_type, size_bytes, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${META_COLS}`,
      [
        projectId,
        docType,
        docDate,
        file.name,
        file.type || null,
        file.size,
        buffer,
        uploadedBy,
      ]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/project-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProjectRow(session, "project_documents", id as string | number);
  if (gate) return gate;

  // Only the two metadata fields are editable; the file itself is immutable
  // (re-upload to replace it).
  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof body.doc_type === "string") {
    if (!DOCUMENT_TYPES.includes(body.doc_type as (typeof DOCUMENT_TYPES)[number])) {
      return NextResponse.json({ error: "A valid document type is required" }, { status: 400 });
    }
    values.push(body.doc_type); sets.push(`doc_type = $${values.length}`);
  }
  if ("doc_date" in body) {
    values.push(typeof body.doc_date === "string" && body.doc_date ? body.doc_date : null);
    sets.push(`doc_date = $${values.length}`);
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.project_documents
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length}
      RETURNING ${META_COLS}`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/project-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProjectRow(session, "project_documents", id);
  if (gate) return gate;

  try {
    await query(`DELETE FROM reporting_platform.project_documents WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/project-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
