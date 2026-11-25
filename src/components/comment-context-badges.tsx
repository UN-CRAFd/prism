import { Badge } from "@/components/ui/badge";
import { cn, shortName } from "@/lib/utils";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import labels from "@/lib/labels";
import { Hint } from "@/components/ui/hint";

// Resolve a section's display label live (reads the possibly-overridden labels
// singleton at call time rather than snapshotting it at module load).
function sectionLabelFor(section: string): string | undefined {
  const reportSection = REPORT_SECTIONS.find((s) => s.value === section);
  if (reportSection) return reportSection.label;
  // Sections that aren't in the report tab list (prodoc-only, or nested in a tab).
  const extras: Record<string, string> = {
    general: labels.sections.general,
    narratives: labels.sections.narratives,
    signatures: labels.sections.signatures,
    sdg: labels.sections.sdg,
    // Part of the Budget tab, but its row comments keep their own section.
    transfers: labels.sections.transfers,
  };
  return extras[section];
}

// The prodoc editor relabels a couple of sections vs the report editor, so a
// prodoc comment's badge matches what the partner sees in that editor.
const PRODOC_SECTION_LABEL: Record<string, string> = {
  expenditure: "Budget",
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
  hideProject,
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
  hideProject?: boolean;
  className?: string;
}) {
  const isProdoc = dataType === "prodoc";
  const rt = reportType ?? "annual";
  const reportLabel = isProdoc
    ? "Project Document"
    : `${rt.charAt(0).toUpperCase()}${rt.slice(1)} Report ${year}`;
  const sectionLabel =
    (isProdoc && PRODOC_SECTION_LABEL[section]) || sectionLabelFor(section) || section;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {itemLabel && (
        <Hint label={itemLabel}>
          <Badge className="max-w-[240px] truncate border-crafd-yellow-400 bg-crafd-yellow-100 text-crafd-grey-800">
            {itemLabel}
          </Badge>
        </Hint>
      )}
      {partner && <Badge variant="secondary">{shortName(partner)}</Badge>}
      <Badge variant="secondary">{reportLabel}</Badge>
      {!hideProject && <Badge variant="outline">{project}</Badge>}
      <Badge variant="outline">{sectionLabel}</Badge>
    </div>
  );
}
