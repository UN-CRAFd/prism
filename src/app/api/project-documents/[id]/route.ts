import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProjectRow } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Single-file download for a project document. Streams the stored bytes with a
// Content-Disposition so the browser downloads it under its original name.
//   GET /api/project-documents/[id]

type DocRow = {
  file_name: string;
  mime_type: string | null;
  content: Buffer;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProjectRow(session, "project_documents", id);
  if (gate) return gate;

  try {
    const rows = await query<DocRow>(
      `SELECT file_name, mime_type, content
         FROM reporting_platform.project_documents
        WHERE id = $1`,
      [id]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const doc = rows[0];
    // pg returns bytea as a Node Buffer; hand its bytes to the Response body.
    const body = new Uint8Array(doc.content);
    // Quote-escape the filename for the header.
    const safeName = doc.file_name.replace(/"/g, "'");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("GET /api/project-documents/[id] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
