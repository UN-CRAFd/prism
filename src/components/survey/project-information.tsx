"use client";

import type { ProjectInformation } from "@/lib/survey-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Props {
  data: ProjectInformation;
  onChange: (data: ProjectInformation) => void;
}

export function ProjectInformationForm({ data, onChange }: Props) {
  function update<K extends keyof ProjectInformation>(
    field: K,
    value: ProjectInformation[K]
  ) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Project Information</CardTitle>
          <CardDescription>
            Provide the core details about your project for this reporting period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="projectTitle">Project title</Label>
              <Input
                id="projectTitle"
                value={data.projectTitle}
                onChange={(e) => update("projectTitle", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="mptfoProjectNumber">MPTFO project number</Label>
              <Input
                id="mptfoProjectNumber"
                value={data.mptfoProjectNumber}
                onChange={(e) => update("mptfoProjectNumber", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="organizationName">Organization name</Label>
              <Input
                id="organizationName"
                value={data.organizationName}
                onChange={(e) => update("organizationName", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="organizationWebsite">Organization website</Label>
              <Input
                id="organizationWebsite"
                value={data.organizationWebsite}
                onChange={(e) => update("organizationWebsite", e.target.value)}
                type="url"
                placeholder="https://"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="projectDuration">Project duration (months)</Label>
              <Input
                id="projectDuration"
                value={data.projectDuration}
                onChange={(e) => update("projectDuration", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="grantSize">Grant size (USD)</Label>
              <Input
                id="grantSize"
                value={data.grantSize}
                onChange={(e) => update("grantSize", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="implementingPartners">Implementing partners</Label>
              <Input
                id="implementingPartners"
                value={data.implementingPartners}
                onChange={(e) => update("implementingPartners", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="geographicScope">Geographic scope</Label>
              <Input
                id="geographicScope"
                value={data.geographicScope}
                onChange={(e) => update("geographicScope", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reportSubmissionDate">Report submission date</Label>
              <Input
                id="reportSubmissionDate"
                type="date"
                value={data.reportSubmissionDate}
                onChange={(e) => update("reportSubmissionDate", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authorization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/50 p-4 mb-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We grant the Complex Risk Analytics Fund (CRAF&apos;d) a non-exclusive,
              worldwide, royalty-free, perpetual license to use, reproduce, adapt,
              distribute, and publicly display the submitted quotes, photographs,
              videos, and other communication materials solely for communications,
              outreach, advocacy, and reporting purposes.
            </p>
            <Separator className="my-3" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              We confirm that we hold all necessary rights and have obtained required
              consents from any individuals or third parties featured, in line with
              applicable laws and ethical standards. Ownership remains with the
              originating party. Where feasible, CRAF&apos;d will provide attribution
              as specified, except where impracticable or inconsistent with the format
              or purpose of use. Materials shall not be used in a misleading or
              defamatory manner.
            </p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.authorizationGranted}
              onChange={(e) => update("authorizationGranted", e.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-crafd-yellow"
            />
            <span className="text-sm font-medium">
              I confirm and grant the above authorization
            </span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
