import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { badRequest, invalidJson, serverError } from "@/lib/http";
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, isAllowedImageExtension } from "@/lib/documents";

// Photos attached to testimonials. Each row in testimonial_photos has EITHER a
// photo_link (external URL) OR an uploaded file (bytes in photo_content). The
// bytes are never returned here — they stream from /api/testimonial-photos/[id]/file.
//
//   GET   ?testimonialId=  → list photos, no bytes
//   POST  JSON { testimonialId, photo_link?, photo_label?, photo_credits? }  → add link
//   POST  multipart { testimonialId, file, photo_label?, photo_credits? }    → add upload
//   PATCH JSON { id, photo_link?, photo_label?, photo_credits? }             → update
//   DELETE ?id=                                                              → remove

const PHOTO_COLS =
  "id, testimonial_id, photo_link, photo_file_name, photo_mime_type, photo_size_bytes, (photo_content IS NOT NULL) AS has_file, photo_label, photo_credits, sort_order";

export async function GET(req: NextRequest) {
  const testimonialId = req.nextUrl.searchParams.get("testimonialId");
  if (!testimonialId) return badRequest("testimonialId is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const testimonials = await query<{ report_id: number }>(
    `SELECT report_id FROM reporting_platform.testimonials WHERE id = $1`,
    [testimonialId]
  );
  if (!testimonials.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await guardReport(session, testimonials[0].report_id);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT ${PHOTO_COLS}
         FROM reporting_platform.testimonial_photos
        WHERE testimonial_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [testimonialId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/testimonial-photos error:", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let testimonialId: string | null;
  let photoLink: string | null = null;
  let photoLabel: string | null = null;
  let photoCredits: string | null = null;
  let file: File | null = null;

  if (isMultipart) {
    let form: FormData;
    try { form = await req.formData(); } catch {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    testimonialId = form.get("testimonialId") as string | null;
    const f = form.get("file");
    file = f instanceof File ? f : null;
    photoLabel = form.get("photo_label") as string | null;
    photoCredits = form.get("photo_credits") as string | null;
  } else {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return invalidJson(); }
    testimonialId = body.testimonialId != null ? String(body.testimonialId) : null;
    photoLink = typeof body.photo_link === "string" ? body.photo_link : null;
    photoLabel = typeof body.photo_label === "string" ? body.photo_label : null;
    photoCredits = typeof body.photo_credits === "string" ? body.photo_credits : null;
  }

  if (!testimonialId) return badRequest("testimonialId is required");

  const gate = await guardRow(session, "testimonials", testimonialId, { requireOpen: true });
  if (gate) return gate;

  try {
    const testimonials = await query<{ kind: string }>(
      `SELECT kind FROM reporting_platform.testimonials WHERE id = $1`,
      [testimonialId]
    );
    if (!testimonials.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (testimonials[0].kind === "partner") {
      const existing = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM reporting_platform.testimonial_photos WHERE testimonial_id = $1`,
        [testimonialId]
      );
      if (Number(existing[0].count) >= 1) {
        return NextResponse.json({ error: "Partner quotes can have one photo." }, { status: 400 });
      }
    }

    const sortRows = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM reporting_platform.testimonial_photos WHERE testimonial_id = $1`,
      [testimonialId]
    );
    const nextSort = (sortRows[0].max ?? 0) + 1;

    if (isMultipart) {
      if (!file || file.size === 0) {
        return NextResponse.json({ error: "A file is required" }, { status: 400 });
      }
      if (!isAllowedImageExtension(file.name)) {
        return NextResponse.json({ error: "That image type is not allowed" }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: `Image exceeds the ${MAX_PHOTO_MB} MB limit` }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const rows = await query(
        `INSERT INTO reporting_platform.testimonial_photos
           (testimonial_id, photo_content, photo_mime_type, photo_file_name, photo_size_bytes,
            photo_label, photo_credits, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${PHOTO_COLS}`,
        [testimonialId, buffer, file.type || null, file.name, file.size,
         photoLabel || null, photoCredits || null, nextSort]
      );
      return NextResponse.json(rows[0], { status: 201 });
    }

    const rows = await query(
      `INSERT INTO reporting_platform.testimonial_photos
         (testimonial_id, photo_link, photo_label, photo_credits, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PHOTO_COLS}`,
      [testimonialId, photoLink || null, photoLabel || null, photoCredits || null, nextSort]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/testimonial-photos error:", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return invalidJson(); }

  const { id } = body;
  if (!id) return badRequest("id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const photos = await query<{ testimonial_id: number }>(
    `SELECT testimonial_id FROM reporting_platform.testimonial_photos WHERE id = $1`,
    [id]
  );
  if (!photos.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await guardRow(session, "testimonials", photos[0].testimonial_id, { requireOpen: true });
  if (gate) return gate;

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if ("photo_link" in body) {
    values.push(body.photo_link ?? null);
    setClauses.push(`photo_link = $${values.length}`);
    if (typeof body.photo_link === "string" && body.photo_link.trim() !== "") {
      setClauses.push(`photo_content = NULL, photo_mime_type = NULL, photo_file_name = NULL, photo_size_bytes = NULL`);
    }
  }
  if ("photo_label" in body) {
    values.push(body.photo_label ?? null);
    setClauses.push(`photo_label = $${values.length}`);
  }
  if ("photo_credits" in body) {
    values.push(body.photo_credits ?? null);
    setClauses.push(`photo_credits = $${values.length}`);
  }

  if (setClauses.length === 0) return badRequest("at least one of photo_link, photo_label, photo_credits is required");

  values.push(id);

  try {
    const rows = await query(
      `UPDATE reporting_platform.testimonial_photos
          SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length}
      RETURNING ${PHOTO_COLS}`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/testimonial-photos error:", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const photos = await query<{ testimonial_id: number }>(
    `SELECT testimonial_id FROM reporting_platform.testimonial_photos WHERE id = $1`,
    [id]
  );
  if (!photos.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await guardRow(session, "testimonials", photos[0].testimonial_id, { requireOpen: true });
  if (gate) return gate;

  try {
    await query(`DELETE FROM reporting_platform.testimonial_photos WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/testimonial-photos error:", err);
    return serverError();
  }
}
