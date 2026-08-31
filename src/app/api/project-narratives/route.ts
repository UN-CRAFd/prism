import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { sanitizeRichText } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { badRequest } from "@/lib/http";
import { narrativeLimit } from "@/lib/limits";
import { richTextLength } from "@/lib/richtext";

// Project-level narrative texts for the project document. One row per
// (project_id, narrative_key); the question set/labels live in labels.json.
//
//   GET   ?project_id=X            → all narrative rows for the project
//   PATCH { project_id, narrative_key, answer }
//                                  → upsert the answer for one key

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT n.id, n.project_id, n.narrative_key,
              n.label,
              COALESCE(s.description, n.description) AS description,
              n.sort_order, n.answer
         FROM reporting_platform.project_narratives n
         LEFT JOIN reporting_platform.standard_narrative_questions s
                ON s.narrative_key = n.narrative_key
        WHERE n.project_id = $1
        ORDER BY n.sort_order, n.id`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-narratives error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
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

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  try {
    const sanitizedAnswer = sanitizeRichText((body.answer as string) || null) ?? null;
    const limit = narrativeLimit(narrative_key as string);
    const len = richTextLength(sanitizedAnswer);
    if (len > limit) {
      return badRequest(
        `Answer exceeds the ${limit.toLocaleString("en-US")}-character limit (${len.toLocaleString("en-US")} entered).`
      );
    }

    const rows = await query(
      `INSERT INTO reporting_platform.project_narratives (project_id, narrative_key, label, description, answer)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, narrative_key)
       DO UPDATE SET answer = EXCLUDED.answer
       RETURNING id, project_id, narrative_key, label, description, sort_order, answer`,
      [
        project_id,
        narrative_key,
        typeof body.label === "string" ? body.label : null,
        typeof body.description === "string" ? body.description : null,
        sanitizedAnswer,
      ]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/project-narratives error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
