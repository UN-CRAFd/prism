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
import type { WorkPlanRow } from "@/lib/survey-data";

interface WorkPlanFormProps {
  rows: WorkPlanRow[];
  onChange: (rows: WorkPlanRow[]) => void;
}

const quarterOptions = ["Planned", "In Progress", "Completed", "Delayed"];
const statusOptions = ["On Track", "Delayed", "Completed"];

const selectClassName =
  "flex h-8 rounded-md border border-input bg-transparent px-2 text-sm";

export function WorkPlanForm({ rows, onChange }: WorkPlanFormProps) {
  function addRow() {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        activity: "",
        q1: "",
        q2: "",
        q3: "",
        q4: "",
        status: "",
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
          <CardTitle>Work Plan</CardTitle>
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
                <TableHead>Activity</TableHead>
                <TableHead>Q1</TableHead>
                <TableHead>Q2</TableHead>
                <TableHead>Q3</TableHead>
                <TableHead>Q4</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Input
                      value={row.activity}
                      onChange={(e) =>
                        updateRow(row.id, "activity", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  {(["q1", "q2", "q3", "q4"] as const).map((q) => (
                    <TableCell key={q}>
                      <select
                        value={row[q]}
                        onChange={(e) =>
                          updateRow(row.id, q, e.target.value)
                        }
                        className={selectClassName}
                      >
                        <option value="">--</option>
                        {quarterOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  ))}
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
