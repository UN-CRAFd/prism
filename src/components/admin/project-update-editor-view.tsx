"use client";

import { ReportEditor } from "@/components/report-editor/report-editor";

// The admin project-update editor. Same editor as the report one, told to work
// on `update` documents — so its tabs come from each update's unlocked sections
// (see lib/update-sections.ts) rather than the full annual-report set.
//
// This is the Editor-group entry point, reached from the sidebar and listing
// every update the admin can open. The identical editor is also mounted under
// /admin/project-updates/... when an update is opened from that list page.
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
