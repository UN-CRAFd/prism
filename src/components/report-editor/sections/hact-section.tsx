"use client";

import { SectionPlaceholder } from "@/components/report-editor/sections/section-placeholder";

// HACT Recommendations — the assurance actions a tranche release depends on.
//
// Structure only: routed, fields not built yet.
export function HactSection({
  reportId,
  readOnly,
}: {
  reportId: number;
  readOnly?: boolean;
}) {
  return (
    <SectionPlaceholder
      title="HACT Recommendations"
      description="Assurance recommendations and the status of the actions taken against them."
      reportId={reportId}
      readOnly={readOnly}
      planned={[
        "Recommendation, source assurance activity and due date",
        "Action taken and current status",
      ]}
    />
  );
}
