import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin } from "@/lib/authz";
import { sanitizeRichText } from "@/lib/sanitize";
import { logger } from "@/lib/logger";

// The partner Guide (wiki) content. Sections live in wiki_sections and are
// rendered at /partner/wiki and edited at /admin/guide.
//   GET    — any authenticated session (partners see only non-hidden sections)
//   POST   — admin: create a new section from a title (+ optional icon)
//   PATCH  — admin: update title/icon/body/order/hidden; body_html sanitized on write
//   DELETE — admin: remove a section
// The client RichTextEditor is NOT a trust boundary, so body_html is always run
// through sanitizeRichText before it is stored.

type WikiSection = {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  body_html: string;
  sort_order: number;
  hidden: boolean;
};

/** Kebab-case a title into a slug candidate. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// GET /api/wiki-sections
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const where = session.role === "admin" ? "" : "WHERE hidden = FALSE";
  try {
    const rows = await query<WikiSection>(
      `SELECT id, slug, title, icon, body_html, sort_order, hidden
         FROM reporting_platform.wiki_sections
         ${where}
        ORDER BY sort_order, id`
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/wiki-sections error:", err);
    return NextResponse.json({ error: "Failed to load guide sections" }, { status: 500 });
  }
}

// POST /api/wiki-sections — { title, icon? }
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const base = slugify(title) || "section";
  try {
    // Find a free slug: base, then base-2, base-3, … avoiding existing slugs.
    const taken = await query<{ slug: string }>(
      `SELECT slug FROM reporting_platform.wiki_sections WHERE slug = $1 OR slug LIKE $2`,
      [base, `${base}-%`]
    );
    const takenSet = new Set(taken.map((r) => r.slug));
    let slug = base;
    let n = 2;
    while (takenSet.has(slug)) slug = `${base}-${n++}`;

    const rows = await query<WikiSection>(
      `INSERT INTO reporting_platform.wiki_sections (slug, title, icon, sort_order)
       VALUES (
         $1, $2, $3,
         (SELECT COALESCE(MAX(sort_order) + 1, 1) FROM reporting_platform.wiki_sections)
       )
       RETURNING id, slug, title, icon, body_html, sort_order, hidden`,
      [slug, title, icon]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/wiki-sections error:", err);
    return NextResponse.json({ error: "Failed to add guide section" }, { status: 500 });
  }
}

// PATCH /api/wiki-sections — { id, title?, icon?, body_html?, sort_order?, hidden? }
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    sets.push(`title = $${i++}`);
    values.push(title);
  }
  if ("icon" in body) {
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null;
    sets.push(`icon = $${i++}`);
    values.push(icon);
  }
  if (typeof body.body_html === "string") {
    sets.push(`body_html = $${i++}`);
    values.push(sanitizeRichText(body.body_html) ?? "");
  }
  if (typeof body.sort_order === "number") {
    sets.push(`sort_order = $${i++}`);
    values.push(body.sort_order);
  }
  if (typeof body.hidden === "boolean") {
    sets.push(`hidden = $${i++}`);
    values.push(body.hidden);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  values.push(id);
  try {
    const rows = await query<WikiSection>(
      `UPDATE reporting_platform.wiki_sections
          SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING id, slug, title, icon, body_html, sort_order, hidden`,
      values
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/wiki-sections error:", err);
    return NextResponse.json({ error: "Failed to update guide section" }, { status: 500 });
  }
}

// DELETE /api/wiki-sections?id=123
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await query(`DELETE FROM reporting_platform.wiki_sections WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/wiki-sections error:", err);
    return NextResponse.json({ error: "Failed to delete guide section" }, { status: 500 });
  }
}
