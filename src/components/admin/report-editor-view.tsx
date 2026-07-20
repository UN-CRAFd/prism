"use client";

import { ReportEditor } from "@/components/report-editor/report-editor";

// The admin report editor mirrors the partner report editor across every section
// tab, but is editable and lets admins leave comments on individual items.
export function ReportEditorView() {
  return (
    <ReportEditor
      mode="admin"
      showSectionTabs
      basePath="/admin/report-editor"
    />
  );
}
