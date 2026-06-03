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
import type { IndicatorRow } from "@/lib/survey-data";

interface IndicatorsFormProps {
  rows: IndicatorRow[];
  onChange: (rows: IndicatorRow[]) => void;
}

export function IndicatorsForm({ rows, onChange }: IndicatorsFormProps) {
  function addRow() {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        indicator: "",
        baseline: "",
        target: "",
        achieved: "",
        comments: "",
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
          <CardTitle>Performance Indicators</CardTitle>
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
                <TableHead>Indicator</TableHead>
                <TableHead>Baseline</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Input
                      value={row.indicator}
                      onChange={(e) =>
                        updateRow(row.id, "indicator", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.baseline}
                      onChange={(e) =>
                        updateRow(row.id, "baseline", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.target}
                      onChange={(e) =>
                        updateRow(row.id, "target", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.achieved}
                      onChange={(e) =>
                        updateRow(row.id, "achieved", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.comments}
                      onChange={(e) =>
                        updateRow(row.id, "comments", e.target.value)
                      }
                      className="h-8"
                    />
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
