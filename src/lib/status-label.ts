import { optionLabel } from "@/lib/options";

// Display text for workflow statuses. Stored/compared values never change — only
// what is shown. The label comes from the admin-editable option list; a value with
// no matching option shows as the raw value (optionLabel's fallback), so bad data
// stays visible rather than rendering an empty pill.
//
// Reports and project updates use the "reportStatus" group; project documents
// (data_type "prodoc") use "prodocStatus".

export type StatusKind = "report" | "update" | "prodoc";

export function reportStatusLabel(status: string | null | undefined): string {
  return optionLabel("reportStatus", status);
}

export function prodocStatusLabel(status: string | null | undefined): string {
  return optionLabel("prodocStatus", status);
}

/** Pick the right group from a document kind ("prodoc" → project document; anything
 *  else, including "report" / "update" / unknown, → report status). */
export function documentStatusLabel(kind: string | null | undefined, status: string | null | undefined): string {
  return kind === "prodoc" ? prodocStatusLabel(status) : reportStatusLabel(status);
}
