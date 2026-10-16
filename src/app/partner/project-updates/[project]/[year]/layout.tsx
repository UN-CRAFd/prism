import type { ReactNode } from "react";
import { ReportEditor } from "@/components/report-editor/report-editor";

export const dynamic = "force-dynamic";

export default function PartnerProjectUpdatesYearLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReportEditor mode="partner" basePath="/partner/project-updates" dataType="update" />
      {children}
    </>
  );
}
