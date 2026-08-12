import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import labels from "@/lib/labels";

const SECTION_LABEL: Record<string, string> = {
  ...Object.fromEntries(REPORT_SECTIONS.map((s) => [s.value, s.label])),
  // Prodoc-only sections that aren't in the report tab list.
  general: labels.sections.general,
  narratives: labels.sections.narratives,
  signatures: labels.sections.signatures,
  sdg: labels.sections.sdg,
};

// The prodoc editor relabels a couple of sections vs the report editor, so a
// prodoc comment's badge matches what the partner sees in that editor.
const PRODOC_SECTION_LABEL: Record<string, string> = {
  expenditure: "Budgets",
};

// Shared context strip shown below a comment's text on both the admin and partner
// sides: report/project-document · project · section · item, each as a badge.
export function CommentContextBadges({
  partner,
  reportType,
  year,
  project,
  section,
  itemLabel,
  dataType,
  className,
}: {
  partner?: string | null;
  reportType?: string | null;
  year: number;
  project: string;
  section: string;
  itemLabel?: string | null;
  // "prodoc" marks the comment as being on a project document (default "report").
  dataType?: string | null;
  className?: string;
}) {
  const isProdoc = dataType === "prodoc";
  const rt = reportType ?? "annual";
  const reportLabel = isProdoc
    ? "Project Document"
    : `${rt.charAt(0).toUpperCase()}${rt.slice(1)} Report ${year}`;
  const sectionLabel =
    (isProdoc && PRODOC_SECTION_LABEL[section]) || SECTION_LABEL[section] || section;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {itemLabel && (
        <Badge className="max-w-[240px] truncate border-blue-200 bg-blue-50 text-blue-700" title={itemLabel}>
          {itemLabel}
        </Badge>
      )}
      {partner && <Badge variant="secondary">{partner}</Badge>}
      <Badge variant="secondary">{reportLabel}</Badge>
      <Badge variant="outline">{project}</Badge>
      <Badge variant="outline">{sectionLabel}</Badge>
    </div>
  );
}
