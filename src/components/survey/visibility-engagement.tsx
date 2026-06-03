"use client";

import type {
  VisibilityData,
  CoverageEntry,
  PhotoEntry,
  LeadershipTestimonial,
  PartnerTestimonialEntry,
} from "@/lib/survey-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface Props {
  data: VisibilityData;
  onChange: (data: VisibilityData) => void;
}


const COVERAGE_TYPE_OPTIONS = [
  "",
  "Events & Presentations",
  "Publications & Reports",
  "News Media Coverage",
  "Peer-Reviewed Journals",
  "Case Studies"

];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none";

export function VisibilityEngagementForm({ data, onChange }: Props) {
  function updateCoverage(
    index: number,
    field: keyof CoverageEntry,
    value: string
  ) {
    const updated = [...data.externalCoverage];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, externalCoverage: updated });
  }

  function updatePhoto(
    index: number,
    field: keyof PhotoEntry,
    value: string
  ) {
    const updated = [...data.implementationPhotos];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, implementationPhotos: updated });
  }

  function updateLeadership(field: keyof LeadershipTestimonial, value: string) {
    onChange({
      ...data,
      leadershipTestimonial: { ...data.leadershipTestimonial, [field]: value },
    });
  }

  function updatePartnerTestimonial(
    index: number,
    field: keyof PartnerTestimonialEntry,
    value: string
  ) {
    const updated = [...data.partnerTestimonials];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, partnerTestimonials: updated });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-none py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>5. Visibility &amp; External Engagement</CardTitle>
          <CardDescription className="leading-relaxed">
            Document how the project and its results were communicated, referenced,
            or recognised externally during the reporting period. Focus on visibility
            that demonstrates reach, uptake, or influence.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* 5.1 External coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5.1 External coverage and engagement</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Provide at least three examples of where the project&apos;s work was featured,
            discussed, or referenced externally during the reporting period. For each example,
            include a quantitative indicator of reach or engagement where available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-44">Type</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Description</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[140px]">Reach / indicator</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[140px]">Links / materials</th>
                </tr>
              </thead>
              <tbody>
                {data.externalCoverage.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3">
                      <select
                        className={selectClassName}
                        value={entry.type}
                        onChange={(e) => updateCoverage(i, "type", e.target.value)}
                      >
                        {COVERAGE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt || "Select type"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={3}
                        className="text-sm"
                        placeholder="Provide the title and a short description of the engagement or coverage..."
                        value={entry.description}
                        onChange={(e) => updateCoverage(i, "description", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={3}
                        className="text-sm"
                        placeholder="E.g. 50 participants, 1,200 downloads..."
                        value={entry.reachIndicator}
                        onChange={(e) => updateCoverage(i, "reachIndicator", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Textarea
                        rows={3}
                        className="text-sm"
                        placeholder="Direct links..."
                        value={entry.links}
                        onChange={(e) => updateCoverage(i, "links", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5.2 Implementation photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5.2 Project implementation photos</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Submit up to five photos that illustrate the implementation of the project and/or
            the use of the project&apos;s data and insights in practice. Images should reflect
            real project implementation. Please upload as PNG, minimum resolution 3000x2000px (&gt;1.5 MB).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Photo label</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[250px]">Description &amp; short caption</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[150px]">Photo credits</th>
                </tr>
              </thead>
              <tbody>
                {data.implementationPhotos.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3">
                      <Input
                        className="text-sm"
                        placeholder="Label for the photo"
                        value={entry.photoLabel}
                        onChange={(e) => updatePhoto(i, "photoLabel", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={2}
                        className="text-sm"
                        placeholder="Short description and caption..."
                        value={entry.description}
                        onChange={(e) => updatePhoto(i, "description", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Input
                        className="text-sm"
                        placeholder="Photographer / credits"
                        value={entry.photoCredits}
                        onChange={(e) => updatePhoto(i, "photoCredits", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5.3 Leadership testimonial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5.3 Leadership testimonial</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Provide one quote from your organization&apos;s leadership reflecting on the
            project&apos;s results and the contribution of CRAF&apos;d support. Limit the quote
            to a maximum of 25 words. Also submit a high-quality photo of the person quoted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="leadership-quote">Quote (max. 25 words)</Label>
              <Textarea
                id="leadership-quote"
                rows={3}
                value={data.leadershipTestimonial.quote}
                onChange={(e) => updateLeadership("quote", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="leadership-name">Full name of person quoted</Label>
              <Input
                id="leadership-name"
                value={data.leadershipTestimonial.fullName}
                onChange={(e) => updateLeadership("fullName", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="leadership-title">Title of person quoted</Label>
              <Input
                id="leadership-title"
                value={data.leadershipTestimonial.title}
                onChange={(e) => updateLeadership("title", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="leadership-photo">Photo label</Label>
              <Input
                id="leadership-photo"
                value={data.leadershipTestimonial.photoLabel}
                onChange={(e) => updateLeadership("photoLabel", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="leadership-credits">Photo credits</Label>
              <Input
                id="leadership-credits"
                value={data.leadershipTestimonial.photoCredits}
                onChange={(e) => updateLeadership("photoCredits", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5.4 Partner testimonials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5.4 Partner testimonials</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Provide up to three quotes from partners or users of the project&apos;s data
            or insights. Quotes should describe how partners contributed to the project
            or how they used the data in practice. Limit each quote to a maximum of 20 words.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Quote (max. 20 words)</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[140px]">Full name</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Title &amp; organization</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[120px]">Photo credits</th>
                </tr>
              </thead>
              <tbody>
                {data.partnerTestimonials.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={2}
                        className="text-sm"
                        value={entry.quote}
                        onChange={(e) => updatePartnerTestimonial(i, "quote", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        className="text-sm"
                        value={entry.fullName}
                        onChange={(e) => updatePartnerTestimonial(i, "fullName", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        className="text-sm"
                        value={entry.titleOrganization}
                        onChange={(e) => updatePartnerTestimonial(i, "titleOrganization", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Input
                        className="text-sm"
                        value={entry.photoCredits}
                        onChange={(e) => updatePartnerTestimonial(i, "photoCredits", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
