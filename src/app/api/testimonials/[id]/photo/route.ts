import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, isAllowedImageExtension } from "@/lib/documents";

// Uploaded testimonial photo — bytes stored on the testimonials row (same bytea
// mechanism as project_documents). The photo is an alternative to photo_link and
// mutually exclusive with it: uploading clears photo_link, and setting photo_link
// (via the JSON route) clears these bytes.
//
//   POST   multipart/form-data { file }  → store the image, clear photo_link
//   GET                                  → stream the image inline (for <img>)
//   DELETE                               → remove the uploaded image

type PhotoRow = {
  photo_file_name: string | null;
  photo_mime_type: string | null;
  photo_content: Buffer | null;
};

const META_SELECT =
  "id, report_id, kind, photo_file_name, photo_mime_type, photo_size_bytes, photo_link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "testimonials", id, { requireOpen: true });
  if (gate) return gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!isAllowedImageExtension(file.name)) {
    return NextResponse.json({ error: "That image type is not allowed" }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: `Image exceeds the ${MAX_PHOTO_MB} MB limit` }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Storing an upload clears any external link (mutually exclusive).
    const rows = await query(
      `UPDATE reporting_platform.testimonials
          SET photo_content = $1, photo_mime_type = $2, photo_file_name = $3,
              photo_size_bytes = $4, photo_link = NULL, updated_at = NOW()
        WHERE id = $5
      RETURNING ${META_SELECT}`,
      [buffer, file.type || null, file.name, file.size, id]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("POST /api/testimonials/[id]/photo error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "testimonials", id);
  if (gate) return gate;

  try {
    const rows = await query<PhotoRow>(
      `SELECT photo_file_name, photo_mime_type, photo_content
         FROM reporting_platform.testimonials
        WHERE id = $1`,
      [id]
    );
    if (!rows.length || !rows[0].photo_content) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const photo = rows[0];
    // pg returns bytea as a Node Buffer; hand its bytes to the Response body.
    const body = new Uint8Array(photo.photo_content!);
    const safeName = (photo.photo_file_name || "photo").replace(/"/g, "'");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": photo.photo_mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("GET /api/testimonials/[id]/photo error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "testimonials", id, { requireOpen: true });
  if (gate) return gate;

  try {
    const rows = await query(
      `UPDATE reporting_platform.testimonials
          SET photo_content = NULL, photo_mime_type = NULL, photo_file_name = NULL,
              photo_size_bytes = NULL, updated_at = NOW()
        WHERE id = $1
      RETURNING ${META_SELECT}`,
      [id]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("DELETE /api/testimonials/[id]/photo error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
