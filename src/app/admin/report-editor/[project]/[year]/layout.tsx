import type { ReactNode } from "react";
import { ReportEditorView } from "@/components/admin/report-editor-view";

export const dynamic = "force-dynamic";

export default function ReportEditorYearLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReportEditorView />
      {children}
    </>
  );
}
