"use client";

import { FilterChip } from "@/components/report-editor/past-year-chips";
import labels from "@/lib/labels";
import {
  PARTNER_STATUS_ORDER,
  partnerStatusKey,
  partnerStatusKeyLabel,
  type PartnerStatusKey,
} from "@/lib/report-status";

// Status filter chips for the partner list pages: All · To complete · Under review ·
// To revise · Approved. Only statuses present in the list get a chip.
export type PartnerStatusFilterValue = "all" | PartnerStatusKey;

/** Does a document with this workflow status pass the chosen filter? */
export function matchesPartnerStatus(status: string | null | undefined, filter: PartnerStatusFilterValue): boolean {
  return filter === "all" || partnerStatusKey(status) === filter;
}

export function PartnerStatusChips({
  statuses,
  value,
  onChange,
}: {
  statuses: (string | null | undefined)[];
  value: PartnerStatusFilterValue;
  onChange: (v: PartnerStatusFilterValue) => void;
}) {
  const present = new Set(statuses.map(partnerStatusKey));
  const keys = PARTNER_STATUS_ORDER.filter((k) => present.has(k));
  if (keys.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterChip on={value === "all"} onClick={() => onChange("all")}>{labels.partnerListFilterAll}</FilterChip>
      {keys.map((k) => (
        <FilterChip key={k} on={value === k} onClick={() => onChange(k)}>{partnerStatusKeyLabel(k)}</FilterChip>
      ))}
    </div>
  );
}
