import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REPORT_SECTIONS } from "@/lib/report-sections";

const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_SECTIONS.map((s) => [s.value, s.label])
);

// Shared context strip shown below a comment's text on both the admin and partner
// sides: report · project · section · item, each as a badge.
export function CommentContextBadges({
  partner,
  reportType,
  year,
  project,
  section,
  itemLabel,
  className,
}: {
  partner?: string | null;
  reportType?: string | null;
  year: number;
  project: string;
  section: string;
  itemLabel?: string | null;
  className?: string;
}) {
  const rt = reportType ?? "annual";
  const reportLabel = `${rt.charAt(0).toUpperCase()}${rt.slice(1)} Report ${year}`;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {partner && <Badge variant="secondary">{partner}</Badge>}
      <Badge variant="secondary">{reportLabel}</Badge>
      <Badge variant="outline">{project}</Badge>
      <Badge variant="outline">{SECTION_LABEL[section] ?? section}</Badge>
      {itemLabel && (
        <Badge className="max-w-[240px] truncate border-blue-200 bg-blue-50 text-blue-700" title={itemLabel}>
          {itemLabel}
        </Badge>
      )}
    </div>
  );
}
