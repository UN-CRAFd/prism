"use client";

import { SectionPlaceholder } from "@/components/report-editor/sections/section-placeholder";
import type { UpdateSectionVariant } from "@/lib/update-sections";

// HACT Recommendations — the assurance actions a tranche release depends on.
//
// Structure only: routed and variant-aware, fields not built yet.
export function HactSection({
  reportId,
  variant,
  months,
  readOnly,
}: {
  reportId: number;
  variant: UpdateSectionVariant;
  months?: number | null;
  readOnly?: boolean;
}) {
  return (
    <SectionPlaceholder
      title="HACT Recommendations"
      description="Assurance recommendations and the status of the actions taken against them."
      reportId={reportId}
      variant={variant}
      months={months}
      readOnly={readOnly}
      planned={[
        "Recommendation, source assurance activity and due date",
        "Action taken and current status",
      ]}
    />
  );
}
