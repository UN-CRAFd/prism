import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { isAllowedWikiImageExtension, MAX_PHOTO_BYTES, MAX_PHOTO_MB } from "@/lib/documents";
import { checkImageUpload } from "@/lib/image-check";

// Wiki images: screenshots/diagrams embedded in Guide (wiki) section bodies.
// Stored as BYTEA in wiki_images and served from /api/wiki-images/<id>.
//
//   POST  multipart { file }  → admin only; insert image; return { id, url }

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const f = form.get("file");
  const file = f instanceof File ? f : null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!isAllowedWikiImageExtension(file.name)) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF, and WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: `Image exceeds the ${MAX_PHOTO_MB} MB limit` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Real images only (see lib/image-check); guide images may also be GIFs.
  const image = checkImageUpload(buffer, ["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO reporting_platform.wiki_images (content, mime_type, file_name, size_bytes)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [buffer, image.type, file.name, file.size]
    );
    const id = rows[0].id;
    return NextResponse.json({ id, url: `/api/wiki-images/${id}` }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/wiki-images error:", err);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
