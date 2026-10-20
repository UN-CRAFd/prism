import type { ReactNode } from "react";
import { ProjectUpdateEditorView } from "@/components/admin/project-update-editor-view";

export const dynamic = "force-dynamic";

export default function ProjectUpdateEditorYearLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ProjectUpdateEditorView />
      {children}
    </>
  );
}
