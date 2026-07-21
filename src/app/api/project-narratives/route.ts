import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Project-level narrative texts for the project document. One row per
// (project_id, narrative_key); the question set/labels live in labels.json.
//
//   GET   ?project_id=X            → all narrative rows for the project
//   PATCH { project_id, narrative_key, answer, comment }
//                                  → upsert the answer + comment for one key

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  try {
    const rows = await query(
      `SELECT id, project_id, narrative_key, answer, comment
         FROM reporting_platform.project_narratives
        WHERE project_id = $1
        ORDER BY id`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/project-narratives error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, narrative_key } = body;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!narrative_key) return NextResponse.json({ error: "narrative_key is required" }, { status: 400 });

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.project_narratives (project_id, narrative_key, answer, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, narrative_key)
       DO UPDATE SET answer = EXCLUDED.answer, comment = EXCLUDED.comment
       RETURNING id, project_id, narrative_key, answer, comment`,
      [project_id, narrative_key, (body.answer as string) || null, (body.comment as string) || null]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/project-narratives error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
