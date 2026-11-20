// Workflow status values for reports, project updates and project documents.
// Client-safe: constants and pure functions only — no server imports.
//
//   value            report / update label        ProDoc label   partner can edit?
//   "Open"           Template with partner        (same)         yes
//   "Under Review"   CRAF'd review                (same)         no
//   "Partner Review" Partner review               (same)         yes
//   "Closed"         Approved                     —              no
//   "Approved"       —                            Approved       no   (ProDoc only)
//
// The values are stored in reports.status (plain text, default 'Open'). Admins may
// rename the labels in Admin › Settings but not add/remove/reorder the values.

export const STATUS_OPEN = "Open";
export const STATUS_UNDER_REVIEW = "Under Review";
export const STATUS_PARTNER_REVIEW = "Partner Review";
export const STATUS_CLOSED = "Closed";
export const STATUS_APPROVED = "Approved";

/** Statuses in which the partner may edit and submit. */
export const PARTNER_EDITABLE_STATUSES: readonly string[] = [STATUS_OPEN, STATUS_PARTNER_REVIEW];

/** Option groups whose values drive behaviour and so can't be edited in Settings. */
export const LOCKED_STATUS_GROUPS: readonly string[] = ["reportStatus", "prodocStatus"];

/** True only for the partner-editable statuses; unknown / empty values are false. */
export function isPartnerEditable(status: string | null | undefined): boolean {
  return typeof status === "string" && PARTNER_EDITABLE_STATUSES.includes(status);
}

/** True when the document is finished and not even an admin edits it. */
export function isFinalStatus(status: string | null | undefined): boolean {
  return status === STATUS_CLOSED || status === STATUS_APPROVED;
}

/** Param for SQL: `WHERE status = ANY($n)` with `[editableStatusParam()]`
 *  (a text[] — pass it as a single query parameter, not spread). */
export function editableStatusParam(): string[] {
  return [...PARTNER_EDITABLE_STATUSES];
}

/** Inline SQL literal list, e.g. `'Open', 'Partner Review'` — for queries that have
 *  no spare parameter slot. Values are compile-time constants, so this is injection-safe. */
export const EDITABLE_STATUS_SQL_LIST = PARTNER_EDITABLE_STATUSES.map((s) => `'${s}'`).join(", ");
