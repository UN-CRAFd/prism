import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Serve a wiki image by id. Any logged-in user may fetch (partners read the wiki).
// Images are immutable once uploaded, so we send a long cache header.

type ImageRow = {
  content: Buffer;
  mime_type: string;
  file_name: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const rows = await query<ImageRow>(
      `SELECT content, mime_type, file_name
         FROM reporting_platform.wiki_images
        WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const img = rows[0];
    const body = new Uint8Array(img.content);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": img.mime_type || "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${(img.file_name ?? "image").replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    logger.error("GET /api/wiki-images/[id] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
