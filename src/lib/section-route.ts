import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/http";

// Factory for the repeatable "list of items under a report" sections
// (key achievements, partnerships, results, lessons learned, external coverage).
// Each of these is a table of report-scoped rows with a handful of text columns,
// a `links` field and a `sort_order`. The CRUD shape is identical; only the table
// name, editable columns and per-report cap differ.
//
// Usage (in an app/api/<section>/route.ts):
//   export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
//     table: "lessons_learned",
//     fields: ["category", "lesson_learned", "adjustment_informed"],
//     max: 5,
//   });

export interface SectionConfig {
  /** Physical table name in the reporting_platform schema. */
  table: string;
  /** Editable columns, in insert/update order. */
  fields: string[];
  /** Optional per-report cap enforced on POST. */
  max?: number;
  /** Error message returned when the cap is hit. */
  maxMessage?: string;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function assertIdent(name: string) {
  // These come from our own config (never user input), but validate anyway so a
  // typo can never produce malformed / unsafe SQL.
  if (!IDENT.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
}

export function makeSectionRoute(config: SectionConfig) {
  const { table, fields, max, maxMessage } = config;
  assertIdent(table);
  fields.forEach(assertIdent);

  const schemaTable = `reporting_platform.${table}`;
  const fieldList = fields.join(", ");

  async function GET(req: NextRequest) {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const reportId = req.nextUrl.searchParams.get("reportId");
    try {
      if (reportId) {
        const gate = await guardReport(session, reportId);
        if (gate) return gate;
        const rows = await query(
          `SELECT id, report_id, ${fieldList}, sort_order
             FROM ${schemaTable}
            WHERE report_id = $1
            ORDER BY sort_order ASC, id ASC`,
          [reportId]
        );
        return NextResponse.json(rows);
      }

      // Cross-report listing with project/partner context — admin reporting views only.
      if (session.role !== "admin") {
        return NextResponse.json({ error: "reportId is required" }, { status: 400 });
      }
      const rows = await query(
        `SELECT
           t.id,
           t.report_id,
           ${fields.map((f) => `t.${f}`).join(",\n           ")},
           t.sort_order,
           r.year,
           r.report_type,
           p.project_title,
           p.short_name   AS project_short_name,
           pt.short_name  AS partner_short_name,
           pt.long_name   AS partner_long_name
         FROM ${schemaTable} t
         JOIN reporting_platform.reports  r  ON r.id  = t.report_id
         JOIN reporting_platform.projects p  ON p.id  = r.project_id
         JOIN reporting_platform.partners pt ON pt.id = p.partner_id
         WHERE r.data_type = 'report'
         ORDER BY r.year DESC, pt.short_name, p.project_title, t.sort_order`
      );
      return NextResponse.json(rows);
    } catch (err) {
      logger.error(`GET /api section (${table}) error:`, err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  async function POST(req: NextRequest) {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const body = await parseBody(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const reportId = body.reportId;
    if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });

    const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
    if (gate) return gate;

    try {
      const existing = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ${schemaTable} WHERE report_id = $1`,
        [reportId]
      );
      const count = Number(existing[0].count);
      if (max !== undefined && count >= max) {
        return NextResponse.json(
          { error: maxMessage ?? `Maximum of ${max} entries per report` },
          { status: 400 }
        );
      }
      const nextOrder = count + 1;

      const cols = ["report_id", ...fields, "sort_order"];
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const values = [reportId, ...fields.map((f) => body[f] ?? null), nextOrder];

      const rows = await query(
        `INSERT INTO ${schemaTable} (${cols.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values
      );
      return NextResponse.json(rows[0], { status: 201 });
    } catch (err) {
      logger.error(`POST /api section (${table}) error:`, err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  async function PATCH(req: NextRequest) {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const body = await parseBody(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const gate = await guardRow(session, table, id as string | number, { requireOpen: true });
    if (gate) return gate;

    try {
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
      const values = [...fields.map((f) => body[f] ?? null), id];

      const rows = await query(
        `UPDATE ${schemaTable}
            SET ${setClause}, updated_at = NOW()
          WHERE id = $${fields.length + 1}
        RETURNING *`,
        values
      );
      if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(rows[0]);
    } catch (err) {
      logger.error(`PATCH /api section (${table}) error:`, err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  async function DELETE(req: NextRequest) {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const gate = await guardRow(session, table, id, { requireOpen: true });
    if (gate) return gate;
    try {
      await query(`DELETE FROM ${schemaTable} WHERE id = $1`, [id]);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.error(`DELETE /api section (${table}) error:`, err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  return { GET, POST, PATCH, DELETE };
}
