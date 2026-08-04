import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Project-level SDG Target focus for the project document. The set of selected
// SDG targets (sub-indicators of goals 1–17) with a focus percentage each; the
// percentages are meant to sum to 100% across the project (soft rule, enforced
// in the UI). The goal/target catalogue lives in code (src/lib/sdg.ts).
//
//   GET  ?project_id=X   → all selected target rows for the project
//   PUT  { project_id, targets: [{ sdg_goal, target_code, percentage, priority }] }
//                        → replace the whole set for the project (transactional)

interface TargetInput {
  sdg_goal: number;
  target_code: string;
  percentage: number;
  priority: "primary" | "secondary";
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT id, project_id, sdg_goal, target_code, percentage, priority
         FROM reporting_platform.project_sdg_targets
        WHERE project_id = $1
        ORDER BY (priority = 'secondary'), sdg_goal, target_code`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-sdg-targets error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!Array.isArray(body.targets)) {
    return NextResponse.json({ error: "targets must be an array" }, { status: 400 });
  }

  // Validate + normalise each target before touching the DB.
  const targets: TargetInput[] = [];
  const seen = new Set<string>();
  for (const raw of body.targets as unknown[]) {
    const t = raw as Record<string, unknown>;
    const goal = Number(t.sdg_goal);
    const code = typeof t.target_code === "string" ? t.target_code.trim() : "";
    const pct = Number(t.percentage);
    if (!Number.isInteger(goal) || goal < 1 || goal > 17) {
      return NextResponse.json({ error: `Invalid sdg_goal: ${t.sdg_goal}` }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "target_code is required for every target" }, { status: 400 });
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: `Invalid percentage for ${code}` }, { status: 400 });
    }
    if (seen.has(code)) {
      return NextResponse.json({ error: `Duplicate target_code: ${code}` }, { status: 400 });
    }
    const priority = t.priority === "secondary" ? "secondary" : "primary";
    seen.add(code);
    targets.push({ sdg_goal: goal, target_code: code, percentage: pct, priority });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM reporting_platform.project_sdg_targets WHERE project_id = $1`,
      [project_id]
    );
    for (const t of targets) {
      await client.query(
        `INSERT INTO reporting_platform.project_sdg_targets
           (project_id, sdg_goal, target_code, percentage, priority)
         VALUES ($1, $2, $3, $4, $5)`,
        [project_id, t.sdg_goal, t.target_code, t.percentage, t.priority]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("PUT /api/project-sdg-targets error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  } finally {
    client.release();
  }

  const rows = await query(
    `SELECT id, project_id, sdg_goal, target_code, percentage, priority
       FROM reporting_platform.project_sdg_targets
      WHERE project_id = $1
      ORDER BY (priority = 'secondary'), sdg_goal, target_code`,
    [project_id]
  );
  return NextResponse.json(rows);
}
