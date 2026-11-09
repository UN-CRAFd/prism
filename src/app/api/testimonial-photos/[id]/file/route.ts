import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { imageResponseHeaders } from "@/lib/image-check";

// Serves the raw bytes of an uploaded testimonial photo. Same headers and
// permission model as /api/testimonials/[id]/photo (which serves the old
// single-photo column).
//
//   GET              → stream the image inline (for <img src=...>)
//   GET ?download=1  → same bytes as an attachment (save to disk)

type FileRow = {
  photo_file_name: string | null;
  photo_mime_type: string | null;
  photo_content: Buffer | null;
  report_id: number;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const download = req.nextUrl.searchParams.get("download") === "1";

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const rows = await query<FileRow>(
      `SELECT p.photo_file_name, p.photo_mime_type, p.photo_content, t.report_id
         FROM reporting_platform.testimonial_photos p
         JOIN reporting_platform.testimonials t ON t.id = p.testimonial_id
        WHERE p.id = $1`,
      [id]
    );
    if (!rows.length || !rows[0].photo_content) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const gate = await guardReport(session, rows[0].report_id);
    if (gate) return gate;

    const photo = rows[0];
    const body = new Uint8Array(photo.photo_content!);
    // Only real image types are served inline, with nosniff + sandbox CSP —
    // an older row with a non-image type is sent as a download instead.
    return new NextResponse(body, {
      status: 200,
      headers: imageResponseHeaders(
        photo.photo_mime_type,
        { inline: !download, fileName: photo.photo_file_name || "photo" },
        body.byteLength,
      ),
    });
  } catch (err) {
    logger.error("GET /api/testimonial-photos/[id]/file error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
