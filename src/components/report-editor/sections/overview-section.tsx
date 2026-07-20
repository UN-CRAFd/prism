"use client";

import { type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { ItemComments } from "@/components/report-editor/comments-context";
import type { OverviewData } from "@/components/report-editor/types";

const AUTHORIZATION_MESSAGES = labels.authorization.messages;

function Label({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground mb-1.5">{children}</p>;
}

// Read-only overview field: label + value (admin-owned project data shown to partners).
function ReadField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="text-sm">
        {value != null && value !== "" ? value : <span className="text-muted-foreground/50">—</span>}
      </p>
    </div>
  );
}

export interface OverviewSectionProps {
  overview: OverviewData;
  updateOverview: (patch: Partial<OverviewData>) => void;
}

export function OverviewSection({ overview, updateOverview }: OverviewSectionProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            These project details are managed by the CRAF&apos;d Secretariat. Contact them if anything needs updating.
          </p>
          <ItemComments section="overview" itemId={null} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ReadField label={labels.overviewFields.projectTitle} value={overview.project_title} />
          <ReadField label={labels.overviewFields.mptfoProjectNumber} value={overview.mptfo_project_number} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ReadField label={labels.overviewFields.organizationName} value={overview.organization_name} />
          <ReadField
            label={labels.overviewFields.organizationWebsite}
            value={overview.organization_website ? (
              <a href={overview.organization_website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                {overview.organization_website}
              </a>
            ) : null}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ReadField label={labels.overviewFields.projectLead} value={overview.project_lead} />
          <ReadField label={labels.overviewFields.grantSizeUsd} value={overview.grant_size_usd ? `$${Number(overview.grant_size_usd).toLocaleString("en-US")}` : null} />
          <ReadField label={labels.overviewFields.startDate} value={overview.project_start_date ? formatDate(overview.project_start_date) : null} />
          <ReadField label={labels.overviewFields.durationMonths} value={overview.project_duration_months ? `${overview.project_duration_months} months` : null} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ReadField label={labels.overviewFields.implementingPartners} value={overview.implementing_partners} />
          <ReadField label={labels.overviewFields.geographicScope} value={overview.geographic_scope} />
          <ReadField label={labels.overviewFields.reportSubmissionDate} value={overview.report_submission_date ? formatDate(overview.report_submission_date) : null} />
        </div>
      </div>

      {/* Authorization */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{labels.authorization.heading}</h3>
        </div>

        <div className="space-y-2">
          {AUTHORIZATION_MESSAGES.map((msg, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">{msg}</p>
          ))}
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={overview.authorized}
            onChange={(e) => updateOverview({ authorized: e.target.checked })}
            className="size-4 rounded"
          />
          <span className="text-sm font-medium">{labels.authorization.checkbox}</span>
        </label>
      </div>
    </div>
  );
}
