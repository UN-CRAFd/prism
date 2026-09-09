// ─────────────────────────────────────────────────────────────────────────────
// Single choke point for writing entries to reporting_platform.version_log.
//
// Every status transition on a report, prodoc, or project must go through
// `logStatusChange` rather than issuing ad-hoc INSERTs in route handlers.
// Centralising here means auditing, field changes, and new entity types only
// need to be updated in one place.
//
// Append-only by design: the `prism_app` database role has INSERT and SELECT
// on version_log — no UPDATE or DELETE. A log entry is an immutable fact that
// a transition happened; removing or altering rows would compromise the audit
// trail. See db/roles.sql.
//
// Transaction handling:
//   - No client passed → uses the module-level `query` helper (pool checkout,
//     auto-release). Errors are caught and logged; the caller's action proceeds.
//   - Client passed → uses client.query so the INSERT joins the caller's
//     transaction. Errors are rethrown: the caller must roll back rather than
//     commit a status change with no corresponding log entry.
// ─────────────────────────────────────────────────────────────────────────────

import { PoolClient } from "pg";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface VersionLogEntry {
  entity_type: "report" | "prodoc" | "project";
  entity_id: number;
  entity_label?: string | null;
  project_id: number;
  from_status?: string | null;
  to_status: string;
  actor_role: "admin" | "partner";
  actor_org?: string | null;
  actor_name?: string | null;
  reason?: string | null;
}

export async function logStatusChange(
  entry: VersionLogEntry,
  client?: PoolClient
): Promise<void> {
  const {
    entity_type,
    entity_id,
    entity_label,
    project_id,
    from_status,
    to_status,
    actor_role,
    actor_org,
    actor_name,
    reason,
  } = entry;

  const sql = `
    INSERT INTO reporting_platform.version_log
      (entity_type, entity_id, entity_label, project_id,
       from_status, to_status, actor_role, actor_org, actor_name,
       reason, snapshot)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)
  `;

  const params = [
    entity_type,
    entity_id,
    entity_label ?? null,
    project_id,
    from_status ?? null,
    to_status,
    actor_role,
    actor_org ?? null,
    actor_name ?? null,
    reason ?? null,
  ];

  if (client) {
    // Inside a transaction — rethrow so the caller can roll back.
    await client.query(sql, params);
  } else {
    try {
      await query(sql, params);
    } catch (err) {
      logger.error("version_log insert failed", err, { entity_type, entity_id });
    }
  }
}
