"use client";

import { useMemo } from "react";
import type { FundingTransferRow } from "@/lib/survey-data";
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
  rows: FundingTransferRow[];
  onChange: (rows: FundingTransferRow[]) => void;
}

const PARTNER_TYPES = [
  "Civil Society Organization (CSO)",
  "International NGO",
  "National / Local NGO",
  "UN Agency",
  "Government Agency",
  "Academic / Research Institution",
  "Private Sector",
  "Media Organization",
  "Other",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none";

function emptyRow(): FundingTransferRow {
  return {
    id: crypto.randomUUID(),
    organizationName: "",
    websiteLink: "",
    partnerType: "",
    amountTransferred: 0,
    linkedActivity: "",
  };
}

const DEFAULT_ROW_COUNT = 5;

export function FundingTransferForm({ rows, onChange }: Props) {
  // Pad to at least 5 rows for display (like the sheet)
  const displayRows = useMemo<FundingTransferRow[]>(() => {
    if (rows.length >= DEFAULT_ROW_COUNT) return rows;
    const padding = Array.from(
      { length: DEFAULT_ROW_COUNT - rows.length },
      emptyRow
    );
    return [...rows, ...padding];
  }, [rows]);

  // Sync padded display rows back
  function setRows(next: FundingTransferRow[]) {
    onChange(next);
  }

  function update(id: string, field: keyof FundingTransferRow, value: string | number) {
    setRows(displayRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows([...displayRows, emptyRow()]);
  }

  function removeRow(id: string) {
    const next = displayRows.filter((r) => r.id !== id);
    setRows(next.length > 0 ? next : [emptyRow()]);
  }

  const total = displayRows.reduce((s, r) => s + (r.amountTransferred || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>5. Funding Transfer to IPs</CardTitle>
          <CardDescription className="leading-relaxed">
            Report all transfers to implementing partners during this reporting period in USD.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Organization name</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Website</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-52">Organization type</th>
                  <th className="text-right font-medium text-muted-foreground pb-3 w-36">Amount transferred (USD)</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px] pl-4">Linked activity</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 align-middle">
                    <td className="py-2 pr-3">
                      <Input
                        className="text-sm h-9"
                        placeholder="Organization name"
                        value={row.organizationName}
                        onChange={(e) => update(row.id, "organizationName", e.target.value)}
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
                        value={row.partnerType}
                        onChange={(e) => update(row.id, "partnerType", e.target.value)}
                      >
                        <option value="">Select organization type</option>
                        {PARTNER_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        className="text-sm h-9 text-right"
                        placeholder="0"
                        value={row.amountTransferred || ""}
                        onChange={(e) =>
                          update(row.id, "amountTransferred", parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="py-2 pl-4 pr-3">
                      <Input
                        className="text-sm h-9"
                        placeholder="Describe linked activity"
                        value={row.linkedActivity}
                        onChange={(e) => update(row.id, "linkedActivity", e.target.value)}
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
                    Total amount transferred
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
