import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject, guardProjectOpen } from "@/lib/authz";
import { logger } from "@/lib/logger";

// "No documents to upload" confirmation on the project document's Documents tab.
// Uploading is optional; this flag lets the partner mark the tab complete
// without an upload (see /api/prodoc-completion).
//
//   GET ?project_id=X                       → { confirmed: boolean }
//   PUT { project_id, confirmed: boolean }  → { confirmed: boolean }

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query<{ no_documents_confirmed: boolean }>(
      `SELECT no_documents_confirmed FROM reporting_platform.projects WHERE id = $1`,
      [projectId]
    );
    if (!rows.length) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ confirmed: rows[0].no_documents_confirmed === true });
  } catch (err) {
    logger.error("GET /api/project-documents/no-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const projectId = body.project_id;
  if (projectId == null || projectId === "") {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (typeof body.confirmed !== "boolean") {
    return NextResponse.json({ error: "confirmed must be a boolean" }, { status: 400 });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId as string);
  if (gate) return gate;
  const openGate = await guardProjectOpen(session, projectId as string);
  if (openGate) return openGate;

  try {
    const rows = await query<{ no_documents_confirmed: boolean }>(
      `UPDATE reporting_platform.projects
          SET no_documents_confirmed = $2
        WHERE id = $1
        RETURNING no_documents_confirmed`,
      [projectId, body.confirmed]
    );
    if (!rows.length) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ confirmed: rows[0].no_documents_confirmed === true });
  } catch (err) {
    logger.error("PUT /api/project-documents/no-documents error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
