"use client";

export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/admin/shared";
import { GuideEditor } from "@/components/admin/guide-editor";
import labels from "@/lib/labels";

// Admin editor for the partner-facing Guide (wiki). Content is global — one set
// of sections shared by all partners — so this is a standalone page rather than
// a per-project tab. The section list + rich-text editing live in GuideEditor.
export default function GuidePage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={labels.guideEditor.title}
        description={labels.guideEditor.description}
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <GuideEditor />
      </div>
    </div>
  );
}
