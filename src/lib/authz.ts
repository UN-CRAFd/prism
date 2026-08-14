import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// Route-level authorization. The middleware already blocks unauthenticated calls
// at the edge; these helpers run inside route handlers to add (a) defense in depth
// (re-verify the session), (b) role checks the middleware can't express per-method,
// and (c) ownership / IDOR enforcement so a partner can only touch data belonging
// to their own organization. Admins bypass ownership.
//
// The identifier regex on the section table name matters: ownership for row-level
// PATCH/DELETE joins back through an arbitrary table, so we validate it exactly
// like section-route does before interpolating.
// ─────────────────────────────────────────────────────────────────────────────

const IDENT = /^[a-z_][a-z0-9_]*$/;

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "You don't have access to this resource" }, { status: 403 });
}
function locked() {
  return NextResponse.json(
    { error: "This report is not open for editing" },
    { status: 409 }
  );
}

/** Public 403 helper for routes that hand-roll a party/role check (not ownership). */
export { forbidden };

/** Require any authenticated session. Returns the session or a 401 response. */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession();
  return session ?? unauthorized();
}

/** Require an admin session. Returns the session or a 401/403 response. */
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  return session;
}

// Resolve the caller's partners.id. New sessions carry `partner_id` directly;
// sessions minted before that field existed fall back to a lookup by `org`
// (short_name), so already-logged-in partners keep working without re-login.
// Returns null for admins / unknown orgs.
export async function resolvePartnerId(session: Session): Promise<number | null> {
  if (session.partner_id != null) return session.partner_id;
  if (!session.org) return null;
  const rows = await query<{ id: number }>(
    `SELECT id FROM reporting_platform.partners WHERE lower(short_name) = lower($1) LIMIT 1`,
    [session.org]
  );
  return rows.length ? rows[0].id : null;
}

// Project ids where the caller is an EDITOR (implementing partner with prodoc
// edit rights) — used to widen list queries so those projects/prodocs surface
// for the partner even though they don't own them. Returns [] for admins / when
// the partner has no editor grants.
export async function editorProjectIds(session: Session): Promise<number[]> {
  if (session.role === "admin") return [];
  const partnerId = await resolvePartnerId(session);
  if (partnerId == null) return [];
  const rows = await query<{ project_id: number }>(
    `SELECT project_id FROM reporting_platform.project_editors WHERE partner_id = $1`,
    [partnerId]
  );
  return rows.map((r) => r.project_id);
}

// ── Ownership checks (partner short_name === session.org) ────────────────────

// A partner owns a report when it belongs to their org (by short_name). Editors
// (implementing partners in project_editors) are granted PRODOC-ONLY rights, so
// they also match — but only when the report is the project document
// (data_type='prodoc'), never an actual reporting-year report.
async function orgOwnsReport(
  org: string,
  reportId: number | string,
  partnerId: number | null
): Promise<boolean> {
  const rows = await query(
    `SELECT 1
       FROM reporting_platform.reports  r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.id = $1 AND lower(pt.short_name) = lower($2)
      UNION ALL
      SELECT 1
       FROM reporting_platform.reports r
       JOIN reporting_platform.project_editors pe ON pe.project_id = r.project_id
      WHERE r.id = $1 AND pe.partner_id = $3 AND r.data_type = 'prodoc'
      LIMIT 1`,
    [reportId, org, partnerId]
  );
  return rows.length > 0;
}

// ── Report status lock ───────────────────────────────────────────────────────
// A report/prodoc is editable by a partner only while its status is "Open".
// Once authorized it moves to "Under Review" and later "Closed", at which point
// the partner side is read-only (only CRAF'd/admins may still write). The UI
// hides the controls; these helpers enforce it on the server so a hand-crafted
// request cannot mutate a locked report. Admins are never status-locked.
const OPEN_STATUS = "Open";

async function reportStatusById(reportId: number | string): Promise<string | null> {
  const rows = await query<{ status: string }>(
    `SELECT status FROM reporting_platform.reports WHERE id = $1 LIMIT 1`,
    [reportId]
  );
  return rows.length ? rows[0].status : null;
}

// Status of the report a given section row belongs to (row → report join).
async function reportStatusByRow(
  table: string,
  rowId: number | string
): Promise<string | null> {
  if (!IDENT.test(table)) throw new Error(`Invalid table identifier: ${table}`);
  const rows = await query<{ status: string }>(
    `SELECT r.status
       FROM reporting_platform.${table} t
       JOIN reporting_platform.reports r ON r.id = t.report_id
      WHERE t.id = $1
      LIMIT 1`,
    [rowId]
  );
  return rows.length ? rows[0].status : null;
}

// Project-scoped ownership: TRUE when the caller is the project's owner (lead)
// OR an editor listed in project_editors (an implementing partner granted prodoc
// edit rights). Editors are matched by partner_id (resolved from the session);
// the owner is matched by short_name to preserve the existing behaviour.
async function orgOwnsProject(
  org: string,
  projectId: number | string,
  partnerId: number | null
): Promise<boolean> {
  const rows = await query(
    `SELECT 1
       FROM reporting_platform.projects p
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE p.id = $1 AND lower(pt.short_name) = lower($2)
      UNION ALL
      SELECT 1
       FROM reporting_platform.project_editors pe
      WHERE pe.project_id = $1 AND pe.partner_id = $3
      LIMIT 1`,
    [projectId, org, partnerId]
  );
  return rows.length > 0;
}

async function orgOwnsPartner(org: string, partnerId: number | string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM reporting_platform.partners
      WHERE id = $1 AND lower(short_name) = lower($2) LIMIT 1`,
    [partnerId, org]
  );
  return rows.length > 0;
}

// Row-level counterpart of orgOwnsReport: the org owns the row's report, OR an
// editor may reach it when that report is a prodoc (data_type='prodoc').
async function orgOwnsRow(
  org: string,
  table: string,
  rowId: number | string,
  partnerId: number | null
): Promise<boolean> {
  if (!IDENT.test(table)) throw new Error(`Invalid table identifier: ${table}`);
  const rows = await query(
    `SELECT 1
       FROM reporting_platform.${table} t
       JOIN reporting_platform.reports  r  ON r.id  = t.report_id
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE t.id = $1 AND lower(pt.short_name) = lower($2)
      UNION ALL
      SELECT 1
       FROM reporting_platform.${table} t
       JOIN reporting_platform.reports r ON r.id = t.report_id
       JOIN reporting_platform.project_editors pe ON pe.project_id = r.project_id
      WHERE t.id = $1 AND pe.partner_id = $3 AND r.data_type = 'prodoc'
      LIMIT 1`,
    [rowId, org, partnerId]
  );
  return rows.length > 0;
}

// Ownership for a row in a project-scoped table (has a project_id column).
// Like orgOwnsProject, allows the project owner (by short_name) OR an editor
// listed in project_editors (by partner_id).
async function orgOwnsProjectRow(
  org: string,
  table: string,
  rowId: number | string,
  partnerId: number | null
): Promise<boolean> {
  if (!IDENT.test(table)) throw new Error(`Invalid table identifier: ${table}`);
  const rows = await query(
    `SELECT 1
       FROM reporting_platform.${table} t
       JOIN reporting_platform.projects p  ON p.id  = t.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE t.id = $1 AND lower(pt.short_name) = lower($2)
      UNION ALL
      SELECT 1
       FROM reporting_platform.${table} t
       JOIN reporting_platform.project_editors pe ON pe.project_id = t.project_id
      WHERE t.id = $1 AND pe.partner_id = $3
      LIMIT 1`,
    [rowId, org, partnerId]
  );
  return rows.length > 0;
}

// Ownership for a row in a PARTNER-scoped table (has a partner_id column) — e.g.
// partner_contacts.
async function orgOwnsPartnerRow(
  org: string,
  table: string,
  rowId: number | string
): Promise<boolean> {
  if (!IDENT.test(table)) throw new Error(`Invalid table identifier: ${table}`);
  const rows = await query(
    `SELECT 1
       FROM reporting_platform.${table} t
       JOIN reporting_platform.partners pt ON pt.id = t.partner_id
      WHERE t.id = $1 AND lower(pt.short_name) = lower($2)
      LIMIT 1`,
    [rowId, org]
  );
  return rows.length > 0;
}

// ── Guards: return null when access is allowed, or a NextResponse to return. ──

/**
 * Allow admins; allow partners only for reports their org owns. Pass
 * `{ requireOpen: true }` on writes so a partner cannot mutate a report that is
 * Under Review / Closed (admins are never status-locked).
 */
export async function guardReport(
  session: Session,
  reportId: number | string | null | undefined,
  opts?: { requireOpen?: boolean }
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !reportId) return forbidden();
  const partnerId = await resolvePartnerId(session);
  if (!(await orgOwnsReport(session.org, reportId, partnerId))) return forbidden();
  if (opts?.requireOpen) {
    const status = await reportStatusById(reportId);
    if (status !== OPEN_STATUS) return locked();
  }
  return null;
}

export async function guardProject(
  session: Session,
  projectId: number | string | null | undefined
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !projectId) return forbidden();
  const partnerId = await resolvePartnerId(session);
  return (await orgOwnsProject(session.org, projectId, partnerId)) ? null : forbidden();
}

export async function guardPartner(
  session: Session,
  partnerId: number | string | null | undefined
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !partnerId) return forbidden();
  return (await orgOwnsPartner(session.org, partnerId)) ? null : forbidden();
}

/**
 * Ownership for a row identified only by its primary key in a report-scoped
 * table. Pass `{ requireOpen: true }` on writes so a partner cannot mutate a row
 * belonging to a report that is Under Review / Closed.
 */
export async function guardRow(
  session: Session,
  table: string,
  rowId: number | string | null | undefined,
  opts?: { requireOpen?: boolean }
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !rowId) return forbidden();
  const partnerId = await resolvePartnerId(session);
  if (!(await orgOwnsRow(session.org, table, rowId, partnerId))) return forbidden();
  if (opts?.requireOpen) {
    const status = await reportStatusByRow(table, rowId);
    if (status !== OPEN_STATUS) return locked();
  }
  return null;
}

/**
 * Ownership for a row identified only by its primary key in a PROJECT-scoped
 * table (a `project_id` column rather than `report_id`) — e.g. indicators,
 * workplan_activities. Rows whose project_id is NULL (library/standard rows)
 * belong to no partner, so only admins may touch them.
 */
export async function guardProjectRow(
  session: Session,
  table: string,
  rowId: number | string | null | undefined
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !rowId) return forbidden();
  const partnerId = await resolvePartnerId(session);
  return (await orgOwnsProjectRow(session.org, table, rowId, partnerId)) ? null : forbidden();
}

/** Ownership for a row identified only by its primary key in a PARTNER-scoped table. */
export async function guardPartnerRow(
  session: Session,
  table: string,
  rowId: number | string | null | undefined
): Promise<NextResponse | null> {
  if (session.role === "admin") return null;
  if (!session.org || !rowId) return forbidden();
  return (await orgOwnsPartnerRow(session.org, table, rowId)) ? null : forbidden();
}
