"use client";

import { useMemo } from "react";
import type { ExpenditureEntry } from "@/lib/survey-data";
import { EXPENDITURE_CATEGORIES } from "@/lib/indicator-definitions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  entries: ExpenditureEntry[];
  onChange: (entries: ExpenditureEntry[]) => void;
}

function fmt(n: number): string {
  if (!n) return "";
  return n.toLocaleString("en-US");
}

function parseNum(v: string): number {
  return parseFloat(v.replace(/,/g, "")) || 0;
}

const EDITABLE_KEYS = EXPENDITURE_CATEGORIES
  .filter((c) => !c.readOnly)
  .map((c) => c.key);

export function ExpendituresForm({ entries, onChange }: Props) {
  // Ensure we always have an entry for every category
  const allEntries = useMemo<ExpenditureEntry[]>(() => {
    return EXPENDITURE_CATEGORIES.map((cat) => {
      const existing = entries.find((e) => e.category === cat.key);
      return existing ?? {
        category: cat.key,
        approvedAnnualBudget: 0,
        annualExpenditure: 0,
        description: "",
        comment: "",
      };
    });
  }, [entries]);

  function update(
    categoryKey: string,
    field: keyof ExpenditureEntry,
    value: string | number
  ) {
    const updated = allEntries.map((e) =>
      e.category !== categoryKey ? e : { ...e, [field]: value }
    );
    onChange(updated);
  }

  // Compute subtotal / ISC / total
  const editable = allEntries.filter((e) => EDITABLE_KEYS.includes(e.category));
  const subtotalApproved = editable.reduce((s, e) => s + e.approvedAnnualBudget, 0);
  const subtotalExpenditure = editable.reduce((s, e) => s + e.annualExpenditure, 0);
  const iscApproved = Math.round(subtotalApproved * 0.07);
  const iscExpenditure = Math.round(subtotalExpenditure * 0.07);
  const totalApproved = subtotalApproved + iscApproved;
  const totalExpenditure = subtotalExpenditure + iscExpenditure;

  const computedValues: Record<string, { approved: number; expenditure: number }> = {
    subtotal: { approved: subtotalApproved, expenditure: subtotalExpenditure },
    isc: { approved: iscApproved, expenditure: iscExpenditure },
    total: { approved: totalApproved, expenditure: totalExpenditure },
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>2. Expenditures</CardTitle>
          <CardDescription className="leading-relaxed">
            Report actual expenditure for this reporting period in USD. Indirect support costs (7%)
            and totals are computed automatically.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Budget category</th>
                  <th className="text-right font-medium text-muted-foreground pb-3 w-36">Approved annual budget (USD)</th>
                  <th className="text-right font-medium text-muted-foreground pb-3 w-36">Annual expenditure (USD)</th>
                  <th className="text-right font-medium text-muted-foreground pb-3 w-32">Difference</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[140px] pl-4">Description</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Comment</th>
                </tr>
              </thead>
              <tbody>
                {EXPENDITURE_CATEGORIES.map((cat) => {
                  const entry = allEntries.find((e) => e.category === cat.key)!;
                  const isReadOnly = cat.readOnly;
                  const isSubtotal = cat.isSubtotal;
                  const isTotal = cat.isTotal;

                  const computed = computedValues[cat.key];
                  const approved = isReadOnly && computed ? computed.approved : entry.approvedAnnualBudget;
                  const expenditure = isReadOnly && computed ? computed.expenditure : entry.annualExpenditure;
                  const diff = approved - expenditure;

                  return (
                    <tr
                      key={cat.key}
                      className={cn(
                        "border-b last:border-0 align-top",
                        isSubtotal && "bg-muted/30",
                        isTotal && "bg-muted/50 font-semibold"
                      )}
                    >
                      <td className={cn("py-2.5 pr-4", isSubtotal && "font-medium", isTotal && "font-bold")}>
                        {cat.label}
                      </td>

                      {/* Approved annual budget */}
                      <td className="py-2.5 pr-3 text-right">
                        {isReadOnly ? (
                          <span className={cn(
                            "text-muted-foreground tabular-nums",
                            isTotal && "font-bold text-foreground"
                          )}>
                            {approved ? approved.toLocaleString("en-US") : "—"}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            className="text-sm text-right w-36"
                            placeholder="0"
                            value={entry.approvedAnnualBudget || ""}
                            onChange={(e) => update(cat.key, "approvedAnnualBudget", parseNum(e.target.value))}
                          />
                        )}
                      </td>

                      {/* Annual expenditure */}
                      <td className="py-2.5 pr-3 text-right">
                        {isReadOnly ? (
                          <span className={cn(
                            "text-muted-foreground tabular-nums",
                            isTotal && "font-bold text-foreground"
                          )}>
                            {expenditure ? expenditure.toLocaleString("en-US") : "—"}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            className="text-sm text-right w-36"
                            placeholder="0"
                            value={entry.annualExpenditure || ""}
                            onChange={(e) => update(cat.key, "annualExpenditure", parseNum(e.target.value))}
                          />
                        )}
                      </td>

                      {/* Difference */}
                      <td className={cn(
                        "py-2.5 pr-4 text-right tabular-nums text-sm",
                        diff < 0 ? "text-rose-600" : diff > 0 ? "text-green-600" : "text-muted-foreground"
                      )}>
                        {(approved || expenditure) ? (
                          <span>
                            {diff > 0 ? "+" : ""}{diff.toLocaleString("en-US")}
                          </span>
                        ) : "—"}
                      </td>

                      {/* Description */}
                      <td className="py-2 pl-4 pr-3">
                        {!isReadOnly && (
                          <Input
                            className="text-sm"
                            placeholder="Optional"
                            value={entry.description}
                            onChange={(e) => update(cat.key, "description", e.target.value)}
                          />
                        )}
                      </td>

                      {/* Comment */}
                      <td className="py-2">
                        {!isReadOnly && (
                          <Input
                            className="text-sm"
                            placeholder="Optional"
                            value={entry.comment}
                            onChange={(e) => update(cat.key, "comment", e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
