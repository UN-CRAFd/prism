"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { RiskRow } from "@/lib/survey-data";

interface RiskManagementFormProps {
  rows: RiskRow[];
  onChange: (rows: RiskRow[]) => void;
}

const levelOptions = ["Low", "Medium", "High"];
const statusOptions = ["Open", "Mitigated", "Closed"];

const selectClassName =
  "flex h-8 rounded-md border border-input bg-transparent px-2 text-sm";

export function RiskManagementForm({ rows, onChange }: RiskManagementFormProps) {
  function addRow() {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        risk: "",
        likelihood: "",
        impact: "",
        mitigation: "",
        status: "",
      },
    ]);
  }

  function updateRow(id: string, field: string, value: string) {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function deleteRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Risk Management</CardTitle>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="mb-4">No data yet</p>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" />
              Add Row
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Risk</TableHead>
                <TableHead>Likelihood</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Mitigation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Input
                      value={row.risk}
                      onChange={(e) =>
                        updateRow(row.id, "risk", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      value={row.likelihood}
                      onChange={(e) =>
                        updateRow(row.id, "likelihood", e.target.value)
                      }
                      className={selectClassName}
                    >
                      <option value="">--</option>
                      {levelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      value={row.impact}
                      onChange={(e) =>
                        updateRow(row.id, "impact", e.target.value)
                      }
                      className={selectClassName}
                    >
                      <option value="">--</option>
                      {levelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.mitigation}
                      onChange={(e) =>
                        updateRow(row.id, "mitigation", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateRow(row.id, "status", e.target.value)
                      }
                      className={selectClassName}
                    >
                      <option value="">--</option>
                      {statusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRow(row.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
