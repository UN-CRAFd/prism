"use client";

import { ReportEditor } from "@/components/report-editor/report-editor";

// The admin project-update editor. Same editor as the report one, told to work
// on `update` documents — so its tabs come from each update's unlocked sections
// (see lib/update-sections.ts) rather than the full annual-report set.
//
// The one place an update is edited, reached from the sidebar's Editor group or
// by opening an update from the Project Updates list — which, like the Reports
// list, only creates and selects documents and then hands off to here.
export function ProjectUpdateEditorView() {
  return (
    <ReportEditor
      mode="admin"
      showSectionTabs
      basePath="/admin/project-update-editor"
      dataType="update"
    />
  );
}
