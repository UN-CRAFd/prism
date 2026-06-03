"use client";

import { useMemo } from "react";
import type { ComplementaryFundingRow } from "@/lib/survey-data";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  rows: ComplementaryFundingRow[];
  onChange: (rows: ComplementaryFundingRow[]) => void;
}

const FUNDING_TYPES = [
  "Government / Official Development Aid",
  "Private Foundation",
  "Corporate / Private Sector",
  "UN / Multilateral",
  "In-kind",
  "Crowdfunding / Public",
  "Internal / Core funds",
  "Other",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none";

function emptyRow(): ComplementaryFundingRow {
  return {
    id: crypto.randomUUID(),
    contributorName: "",
    websiteLink: "",
    fundingType: "",
    totalContribution: 0,
    linkedActivities: "",
  };
}

const DEFAULT_ROW_COUNT = 5;

export function ComplementaryFundingForm({ rows, onChange }: Props) {
  const displayRows = useMemo<ComplementaryFundingRow[]>(() => {
    if (rows.length >= DEFAULT_ROW_COUNT) return rows;
    const padding = Array.from(
      { length: DEFAULT_ROW_COUNT - rows.length },
      emptyRow
    );
    return [...rows, ...padding];
  }, [rows]);

  function setRows(next: ComplementaryFundingRow[]) {
    onChange(next);
  }

  function update(id: string, field: keyof ComplementaryFundingRow, value: string | number) {
    setRows(displayRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows([...displayRows, emptyRow()]);
  }

  function removeRow(id: string) {
    const next = displayRows.filter((r) => r.id !== id);
    setRows(next.length > 0 ? next : [emptyRow()]);
  }

  const total = displayRows.reduce((s, r) => s + (r.totalContribution || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>6. Complementary Funding</CardTitle>
          <CardDescription className="leading-relaxed">
            Report all complementary funding received or committed for this project during
            the reporting period in USD.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Contributor name</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Website</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-56">Funding type</th>
                  <th className="text-right font-medium text-muted-foreground pb-3 w-36">Total contribution (USD)</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px] pl-4">Linked activities</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 align-middle">
                    <td className="py-2 pr-3">
                      <Input
                        className="text-sm h-9"
                        placeholder="Contributor name"
                        value={row.contributorName}
                        onChange={(e) => update(row.id, "contributorName", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="text-sm h-9"
                        placeholder="https://"
                        type="url"
                        value={row.websiteLink}
                        onChange={(e) => update(row.id, "websiteLink", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className={selectClassName}
                        value={row.fundingType}
                        onChange={(e) => update(row.id, "fundingType", e.target.value)}
                      >
                        <option value="">Select funding type</option>
                        {FUNDING_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        className="text-sm h-9 text-right"
                        placeholder="0"
                        value={row.totalContribution || ""}
                        onChange={(e) =>
                          update(row.id, "totalContribution", parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="py-2 pl-4 pr-3">
                      <Input
                        className="text-sm h-9"
                        placeholder="Describe linked activities"
                        value={row.linkedActivities}
                        onChange={(e) => update(row.id, "linkedActivities", e.target.value)}
                      />
                    </td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}

                {/* Total row */}
                <tr className="border-t bg-muted/40">
                  <td colSpan={3} className="py-3 pr-3 font-semibold text-sm">
                    Total
                  </td>
                  <td className={cn(
                    "py-3 pr-3 text-right font-semibold tabular-nums text-sm",
                    total > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {total > 0 ? total.toLocaleString("en-US") : "—"}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-4 border-dashed"
            onClick={addRow}
          >
            <Plus className="size-3.5" />
            Add row
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
