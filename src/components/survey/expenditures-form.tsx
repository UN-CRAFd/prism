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
import type { ExpenditureRow } from "@/lib/survey-data";

interface ExpendituresFormProps {
  rows: ExpenditureRow[];
  onChange: (rows: ExpenditureRow[]) => void;
}

export function ExpendituresForm({ rows, onChange }: ExpendituresFormProps) {
  function addRow() {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        category: "",
        budgeted: 0,
        spent: 0,
        variance: 0,
        comments: "",
      },
    ]);
  }

  function updateRow(id: string, field: string, value: string | number) {
    onChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "budgeted" || field === "spent") {
          updated.variance = updated.budgeted - updated.spent;
        }
        return updated;
      })
    );
  }

  function deleteRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Expenditures</CardTitle>
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
                <TableHead>Category</TableHead>
                <TableHead>Budgeted</TableHead>
                <TableHead>Spent</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Input
                      value={row.category}
                      onChange={(e) =>
                        updateRow(row.id, "category", e.target.value)
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={row.budgeted}
                      onChange={(e) =>
                        updateRow(
                          row.id,
                          "budgeted",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={row.spent}
                      onChange={(e) =>
                        updateRow(
                          row.id,
                          "spent",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.variance.toFixed(2)}
                      readOnly
                      className="h-8 bg-muted"
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
