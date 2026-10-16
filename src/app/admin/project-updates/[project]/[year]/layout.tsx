import type { ReactNode } from "react";
import { ReportEditor } from "@/components/report-editor/report-editor";

export const dynamic = "force-dynamic";

export default function AdminProjectUpdatesYearLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReportEditor
        mode="admin"
        showSectionTabs
        basePath="/admin/project-updates"
        dataType="update"
      />
      {children}
    </>
  );
}
