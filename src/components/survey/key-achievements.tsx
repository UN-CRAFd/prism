"use client";

import type {
  KeyAchievementsData,
  AchievementEntry,
  PartnershipEntry,
  DataUptakeEntry,
} from "@/lib/survey-data";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface Props {
  data: KeyAchievementsData;
  onChange: (data: KeyAchievementsData) => void;
}

const LABELS = ["a", "b", "c"] as const;

export function KeyAchievementsForm({ data, onChange }: Props) {
  function updateAchievement(
    index: number,
    field: keyof AchievementEntry,
    value: string
  ) {
    const updated = [...data.achievements];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, achievements: updated });
  }

  function updatePartnership(
    index: number,
    field: keyof PartnershipEntry,
    value: string
  ) {
    const updated = [...data.ecosystemPartnerships];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, ecosystemPartnerships: updated });
  }

  function updateDataUptake(
    index: number,
    field: keyof DataUptakeEntry,
    value: string
  ) {
    const updated = [...data.dataUptakeResults];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, dataUptakeResults: updated });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-none py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>3. Key Achievements and Results</CardTitle>
          <CardDescription className="leading-relaxed">
            Use this section to highlight your project&apos;s key achievements and results
            from the reporting period. Focus on key milestones, decision-linked use of data
            or insights, and partnership outcomes. Emphasise results and decisions enabled,
            not activities alone.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* 3.1 Key achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3.1 Key achievements</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Present the top three key achievements from the reporting period. Focus on major
            milestones or breakthroughs that led to clear results. The achievements reported
            here will be highlighted on your project page in the upcoming CRAF&apos;d Annual Report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-8">#</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Key achievement</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Significance</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[150px]">Links / materials</th>
                </tr>
              </thead>
              <tbody>
                {data.achievements.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-2 text-muted-foreground font-medium">{LABELS[i]}.</td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Briefly describe a major result or milestone achieved..."
                        value={entry.achievement}
                        onChange={(e) => updateAchievement(i, "achievement", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Explain why this achievement matters and what changed as a result..."
                        value={entry.significance}
                        onChange={(e) => updateAchievement(i, "significance", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Provide direct links to reports, tools, dashboards..."
                        value={entry.links}
                        onChange={(e) => updateAchievement(i, "links", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3.2 Ecosystem partnerships */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3.2 Ecosystem partnership and outcomes</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Describe partnerships that contributed to the implementation of the project and/or
            to strengthening the data and reporting ecosystem. Focus on outcomes and added value
            generated by the partnership rather than coordination activities or processes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-8">#</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Partner organization</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[250px]">Result of the partnership</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[150px]">Links / materials</th>
                </tr>
              </thead>
              <tbody>
                {data.ecosystemPartnerships.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-2 text-muted-foreground font-medium">{LABELS[i]}.</td>
                    <td className="py-3 pr-3">
                      <Input
                        className="text-sm"
                        placeholder="Organization name"
                        value={entry.partnerOrganization}
                        onChange={(e) => updatePartnership(i, "partnerOrganization", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Briefly describe what improved or changed because of the partnership..."
                        value={entry.result}
                        onChange={(e) => updatePartnership(i, "result", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Links to reports, datasets, dashboards..."
                        value={entry.links}
                        onChange={(e) => updatePartnership(i, "links", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3.3 Data uptake results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3.3 Results from data uptake and use</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Provide at least three examples showing how the project&apos;s data or insights were
            taken up and used by partners to inform concrete decisions or actions. Selected
            examples will be featured as &ldquo;Impact Stories&rdquo; on the CRAF&apos;d website.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-8">#</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Context</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Data-driven decision</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Resulting impact</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[120px]">Links / materials</th>
                </tr>
              </thead>
              <tbody>
                {data.dataUptakeResults.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-2 text-muted-foreground font-medium">{LABELS[i]}.</td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Briefly describe the problem, risk, or decision gap..."
                        value={entry.context}
                        onChange={(e) => updateDataUptake(i, "context", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Explain how the project's data informed concrete decisions..."
                        value={entry.dataDrivenDecision}
                        onChange={(e) => updateDataUptake(i, "dataDrivenDecision", e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Describe the difference this made in practice..."
                        value={entry.resultingImpact}
                        onChange={(e) => updateDataUptake(i, "resultingImpact", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Links to reports, articles..."
                        value={entry.links}
                        onChange={(e) => updateDataUptake(i, "links", e.target.value)}
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
