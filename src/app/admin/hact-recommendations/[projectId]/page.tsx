"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader, ErrorBanner } from "@/components/admin/shared";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import { HactSection } from "@/components/report-editor/sections/hact-section";
import { shortName } from "@/lib/utils";

// One project's HACT recommendations. The same rows (and the same component)
// make up the HACT page of each of the project's updates, so edits here show
// there and vice versa.

interface Project {
  project_title: string;
  partner_short_name: string;
}

export default function ProjectHactRecommendationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("Failed to load project");
        setProject(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
  }, [id]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project ? project.project_title : "HACT Recommendations"}
        description={project ? `${shortName(project.partner_short_name)} · HACT Recommendations` : ""}
      >
        <AutosaveIndicator state={saveState} tone="dark" />
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-6">
        <Link
          href="/admin/hact-recommendations"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> All projects
        </Link>

        {error && <ErrorBanner message={error} />}

        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-base text-blue-900">
          Add one row per finding; use a row&apos;s pencil to edit it. This list is shared with all of the
          project&apos;s updates. The partner can respond in the Partner comment column only.
        </div>

        {Number.isInteger(id) && (
          <HactSection projectId={id} isAdmin onSaveStateChange={setSaveState} />
        )}
      </div>
    </div>
  );
}
