import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProjectRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { documentMimeType } from "@/lib/documents";
import { contentDisposition } from "@/lib/content-disposition";

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
    // Always a download (never rendered in the browser), typed by its
    // extension rather than the stored upload-time claim, with nosniff. The
    // file name works in any script (Arabic, Chinese, …) — see
    // lib/content-disposition.
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": documentMimeType(doc.file_name),
        "Content-Disposition": contentDisposition("attachment", doc.file_name),
        "Content-Length": String(body.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("GET /api/project-documents/[id] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
