"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAutosave, type SaveState } from "@/components/autosave";
import { numericAmount } from "@/lib/numeric-input";
import { cn, formatAmount } from "@/lib/utils";
import { Coins, Plus, X } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { FundingSummary } from "@/components/funding-summary";
import labels from "@/lib/labels";

const g = labels.generalInfo;

interface CellForm {
  organization_id: number;
  tranche_number: number;
  amount: string;
  date_description: string;
  release_date: string;
}

interface OrgRow { id: number; name: string }

function parseAmount(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  return parseFloat(t.replace(/,/g, ""));
}

const cellsSnapshot = (cells: CellForm[], count: number) =>
  JSON.stringify({
    count,
    cells: cells.map((c) => ({
      organization_id: c.organization_id,
      tranche_number: c.tranche_number,
      amount: c.amount.trim(),
      date_description: c.date_description.trim(),
      release_date: c.release_date,
    })),
  });

export function TrancheScheduleEditor({
  projectId,
  onSaveStateChange,
  isAdmin = true,
  readOnly = false,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  isAdmin?: boolean;
  readOnly?: boolean;
}) {
  void isAdmin; // accepted for API symmetry; not currently gating any field
  const confirm = useConfirm();

  const [participatingOrgs, setParticipatingOrgs] = useState<OrgRow[]>([]);
  const [trancheCells, setTrancheCells] = useState<CellForm[]>([]);
  const [trancheCount, setTrancheCount] = useState(1);
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const [grantSize, setGrantSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trancheCellsRef = useRef<CellForm[]>([]);
  trancheCellsRef.current = trancheCells;
  const savedCellsRef = useRef<string>('{"count":1,"cells":[]}');
  const participatingOrgsRef = useRef<OrgRow[]>([]);
  participatingOrgsRef.current = participatingOrgs;
  const trancheCountRef = useRef(1);
  trancheCountRef.current = trancheCount;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [projRes, porgsRes, cellsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/project-organizations?project_id=${projectId}`),
          fetch(`/api/project-tranche-cells?project_id=${projectId}`),
        ]);
        if (!projRes.ok || !porgsRes.ok || !cellsRes.ok) throw new Error("Failed to load data");
        if (cancelled) return;

        const proj = await projRes.json();
        const orgRows: (OrgRow & { type: string })[] = await porgsRes.json();
        const rawCells: { organization_id: number; tranche_number: number; amount: string | number | null; date_description: string | null; release_date: string | null }[] =
          await cellsRes.json();

        if (cancelled) return;

        setGrantSize(proj.grant_size_usd != null ? Number(proj.grant_size_usd) : null);
        setParticipatingOrgs(orgRows.filter((o) => o.type === "participating").map(({ id, name }) => ({ id, name })));

        const loadedCells: CellForm[] = rawCells.map((c) => ({
          organization_id: c.organization_id,
          tranche_number: c.tranche_number,
          amount: c.amount != null && Number(c.amount) !== 0 ? String(c.amount) : "",
          date_description: c.date_description ?? "",
          release_date: c.release_date ?? "",
        }));
        const maxTranche = rawCells.reduce((m, c) => Math.max(m, c.tranche_number), 0);
        const loadedCount = Math.max(maxTranche, 1);
        setTrancheCells(loadedCells);
        setTrancheCount(loadedCount);
        savedCellsRef.current = cellsSnapshot(loadedCells, loadedCount);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const flush = useCallback(async () => {
    const curCells = trancheCellsRef.current;
    const curParticipatingOrgs = participatingOrgsRef.current;
    const curCount = trancheCountRef.current;
    const cSnap = cellsSnapshot(curCells, curCount);
    if (cSnap === savedCellsRef.current) return;
    const outgoing = curParticipatingOrgs.flatMap((org) =>
      Array.from({ length: curCount }, (_, i) => {
        const tn = i + 1;
        const cell = curCells.find((c) => c.organization_id === org.id && c.tranche_number === tn);
        return {
          organization_id: org.id,
          tranche_number: tn,
          amount: cell && cell.amount.trim() !== "" ? (parseAmount(cell.amount) || 0) : 0,
          date_description: cell?.date_description.trim() || null,
          release_date: cell?.release_date || null,
        };
      })
    );
    const res = await fetch("/api/project-tranche-cells", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, cells: outgoing }),
    });
    if (!res.ok) throw new Error("Failed to save tranche cells");
    savedCellsRef.current = cSnap;
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const participatingOrgIds = useMemo(() => new Set(participatingOrgs.map((o) => o.id)), [participatingOrgs]);
  const activeCells = trancheCells.filter((c) => participatingOrgIds.has(c.organization_id));
  const cellAmount = (c: CellForm) => (c.amount.trim() === "" ? 0 : parseAmount(c.amount) || 0);
  const trancheTotal = activeCells.reduce((sum, c) => sum + cellAmount(c), 0);
  const getRowTotal = (orgId: number) =>
    activeCells.filter((c) => c.organization_id === orgId).reduce((sum, c) => sum + cellAmount(c), 0);
  const getTrancheTotal = (trancheNumber: number) =>
    activeCells.filter((c) => c.tranche_number === trancheNumber).reduce((sum, c) => sum + cellAmount(c), 0);

  // Warn when any active cell has amount > 0 but no release date.
  const missingReleaseDate = activeCells.some((c) => cellAmount(c) > 0 && !c.release_date);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const setCell = (orgId: number, tranche: number, patch: { amount?: string; date_description?: string; release_date?: string }) => {
    setTrancheCells((prev) => {
      const idx = prev.findIndex((c) => c.organization_id === orgId && c.tranche_number === tranche);
      if (idx === -1) return [...prev, { organization_id: orgId, tranche_number: tranche, amount: "", date_description: "", release_date: "", ...patch }];
      return prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    });
    schedule();
  };

  const addTrancheColumn = () => {
    setTrancheCount((n) => n + 1);
    schedule();
  };

  const removeTrancheColumn = async (tn: number) => {
    const hasData = getTrancheTotal(tn) > 0;
    if (hasData && !await confirm({ message: `Remove tranche ${tn}? The amounts entered for it will be deleted and the remaining tranches renumbered.` })) return;
    setTrancheCells((prev) =>
      prev
        .filter((c) => c.tranche_number !== tn)
        .map((c) => (c.tranche_number > tn ? { ...c, tranche_number: c.tranche_number - 1 } : c))
    );
    setTrancheCount((n) => n - 1);
    schedule();
  };

  if (loading) return <LoadingState className="py-8" />;

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <h3 className="t-heading-sub">{g.tranches.heading}</h3>
        </div>
        {participatingOrgs.length > 0 && (
          <Button onClick={addTrancheColumn} size="sm" variant="outline" className="shrink-0">
            <Plus className="size-4 mr-1" />Add more tranches
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{g.tranches.description}</p>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {participatingOrgs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Add participating organisations in General information first.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-44">
                  Organisation
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                  Amount total
                </th>
                {Array.from({ length: trancheCount }, (_, i) => {
                  const tn = i + 1;
                  return (
                    <Fragment key={tn}>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground border-l whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1.5">
                          {g.tranches.columns.amount} {tn}
                          <button
                            onClick={() => removeTrancheColumn(tn)}
                            disabled={trancheCount <= 1}
                            className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label={`Remove tranche ${tn}`}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-36">
                        {g.tranches.columns.releaseDate}
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-72">
                        {g.tranches.columns.activities}
                      </th>
                    </Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {participatingOrgs.map((org) => {
                const rowTotal = getRowTotal(org.id);
                return (
                  <tr key={org.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 align-middle font-medium text-sm whitespace-nowrap">{org.name}</td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap">
                      {formatAmount(rowTotal)}
                    </td>
                    {Array.from({ length: trancheCount }, (_, i) => {
                      const tn = i + 1;
                      const cellKey = `${org.id}:${tn}`;
                      const cell = trancheCells.find((c) => c.organization_id === org.id && c.tranche_number === tn);
                      const amount = cell?.amount ?? "";
                      const desc = cell?.date_description ?? "";
                      const releaseDate = cell?.release_date ?? "";
                      const amtVal = amount.trim() !== "" ? (parseAmount(amount) || 0) : 0;
                      const needsDate = amtVal > 0 && !releaseDate;
                      return (
                        <Fragment key={tn}>
                          <td className="px-4 py-3 align-middle border-l w-36">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={focusedCellKey === cellKey
                                ? amount
                                : amount.trim() !== "" && !isNaN(parseAmount(amount))
                                  ? formatAmount(parseAmount(amount))
                                  : amount}
                              onChange={(e) => setCell(org.id, tn, { amount: numericAmount(e.target.value) })}
                              onFocus={() => setFocusedCellKey(cellKey)}
                              onBlur={() => {
                                setFocusedCellKey(null);
                                const parsed = parseAmount(amount);
                                if (amount.trim() !== "" && !isNaN(parsed)) {
                                  setCell(org.id, tn, { amount: String(parsed) });
                                }
                              }}
                              placeholder="0.00"
                              className="h-8 text-sm text-right tabular-nums w-full"
                              aria-label={`Tranche ${tn} amount for ${org.name}`}
                              disabled={readOnly}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle w-36">
                            <DateInput
                              value={releaseDate}
                              onChange={(v) => setCell(org.id, tn, { release_date: v })}
                              disabled={readOnly}
                              className={cn(needsDate && "border-amber-400")}
                              aria-label={`Tranche ${tn} release date for ${org.name}`}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle w-72">
                            <Textarea
                              value={desc}
                              onChange={(e) => setCell(org.id, tn, { date_description: e.target.value })}
                              placeholder="Activities covered by this tranche"
                              className="text-sm min-h-[60px] resize-y w-full"
                              aria-label={`Tranche ${tn} activities for ${org.name}`}
                              disabled={readOnly}
                            />
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-3 align-middle text-sm font-semibold">{g.tranches.total}</td>
                <td className="px-4 py-3 align-middle text-right">
                  <span className="text-sm font-semibold tabular-nums">{formatAmount(trancheTotal)}</span>
                </td>
                {Array.from({ length: trancheCount * 3 }, (_, i) => {
                  const tn = Math.floor(i / 3) + 1;
                  const isAmountCol = i % 3 === 0;
                  return (
                    <td key={i} className={cn(isAmountCol ? "border-l px-4 py-3 text-right text-sm font-semibold tabular-nums" : "")}>
                      {isAmountCol ? formatAmount(getTrancheTotal(tn)) : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {missingReleaseDate && (
        <p className="text-sm text-amber-700">{g.tranches.missingReleaseDate}</p>
      )}

      <FundingSummary kind="tranche" requested={grantSize} total={trancheTotal} />
    </div>
  );
}
