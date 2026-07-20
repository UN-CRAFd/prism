"use client";

import { ReportEditor } from "@/components/report-editor/report-editor";

// The admin report editor is a read-only mirror of the partner report editor:
// every section tab, showing exactly what the partner entered, with all inputs
// disabled. Report content is authored by partners; admins define baselines in
// the Project Document Editor.
export function ReportEditorView() {
  return (
    <ReportEditor
      mode="admin"
      forceReadOnly
      showSectionTabs
      basePath="/admin/report-editor"
    />
  );
}
