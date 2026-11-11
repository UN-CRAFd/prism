"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingState, ErrorBanner } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import type { Finding, SecurityReport } from "@/lib/security-check";

// Admin "Security" tab: the latest monthly package & security check
// (scripts/security-check.mjs → /api/security-checks/report), what needs
// immediate action, and the history of runs.

type Status = "ok" | "attention" | "action";
interface Latest { id: number; runAt: string; source: string; status: Status; report: SecurityReport }
interface HistoryRow {
  id: number; runAt: string; source: string; status: Status;
  counts: { action: number; attention: number; info: number } | null;
}

const STALE_DAYS = 35;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const SOURCE_LABEL: Record<string, string> = {
  scheduled: "Monthly check (automatic)",
  manual: "Manual check",
  script: "Check script",
  "manual-platform": "Platform re-check from this page",
};

const STATUS_STYLE: Record<Status, { box: string; label: string; Icon: typeof CheckCircle2 }> = {
  action: { box: "border-red-300 bg-red-50 text-red-900", label: "Immediate action required", Icon: XCircle },
  attention: { box: "border-crafd-yellow-400 bg-crafd-yellow-100 text-crafd-grey-800", label: "Some items need attention", Icon: AlertTriangle },
  ok: { box: "border-green-300 bg-green-50 text-green-900", label: "All checks passed", Icon: CheckCircle2 },
};

function StatusPill({ status }: { status: Status }) {
  const cls = status === "action" ? "bg-red-100 text-red-800" : status === "attention" ? "bg-crafd-yellow-200 text-crafd-grey-800" : "bg-green-100 text-green-800";
  const text = status === "action" ? "Action" : status === "attention" ? "Attention" : "OK";
  return <span className={cn("inline-flex rounded px-2 py-0.5 text-xs font-semibold", cls)}>{text}</span>;
}

function FindingList({ findings, tone }: { findings: Finding[]; tone: "action" | "attention" | "info" }) {
  const Icon = tone === "action" ? XCircle : tone === "attention" ? AlertTriangle : Info;
  const color = tone === "action" ? "text-red-600" : tone === "attention" ? "text-crafd-yellow-900" : "text-muted-foreground";
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {findings.map((f, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <Icon className={cn("size-4 mt-0.5 shrink-0", color)} aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">
              {f.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{f.area === "packages" ? "Packages" : "Platform"}</span>
            </p>
            {f.detail && <p className="text-sm text-muted-foreground break-words">{f.detail}</p>}
            {f.fix && <p className="text-sm"><span className="font-medium">How to fix:</span> <code className="text-xs">{f.fix}</code></p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="t-heading-section">{title}</h2>
      {children}
    </section>
  );
}

export default function SecurityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [rechecking, setRechecking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/security-checks", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setAvailable(data.available !== false);
      setLatest(data.latest ?? null);
      setHistory(data.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function recheck() {
    setRechecking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security-checks", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "The check failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check failed");
    } finally {
      setRechecking(false);
    }
  }

  const report = latest?.report;
  const ageDays = latest ? (Date.now() - new Date(latest.runAt).getTime()) / 86_400_000 : null;
  const vulns = report?.packages?.audit.vulnerabilities ?? [];
  const outdated = report?.packages?.outdated.packages ?? [];
  const byLevel = (l: Finding["level"]) => report?.findings.filter((f) => f.level === l) ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Security" description="Monthly package and security check of the platform">
        <Button size="sm" variant="secondary" onClick={recheck} disabled={rechecking || !available}>
          {rechecking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Re-check platform now
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8 max-w-5xl">
        {error && <ErrorBanner message={error} />}
        {loading ? <LoadingState /> : !available ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            The security check is not set up on this database yet. Run{" "}
            <code>node --env-file=.env db/run-sql.mjs db/add-security-checks.sql</code> and restart the app.
          </div>
        ) : !latest || !report ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">No check has run yet.</p>
            <p>
              The check runs automatically on the 1st of every month (GitHub Actions). To run it now, use{" "}
              <code>node scripts/security-check.mjs</code> (see the README, “Monthly security check”), or click
              “Re-check platform now” for the platform part only.
            </p>
          </div>
        ) : (
          <>
            {/* Verdict */}
            {(() => {
              const s = STATUS_STYLE[latest.status];
              return (
                <div className={cn("rounded-xl border px-5 py-4 flex items-start gap-3", s.box)} role="status">
                  <s.Icon className="size-6 shrink-0 mt-0.5" aria-hidden />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{s.label}</p>
                    <p className="text-sm">
                      Last check: <span className="font-medium">{fmt(latest.runAt)}</span> · {SOURCE_LABEL[latest.source] ?? latest.source}
                      {report.counts && (
                        <> · {report.counts.action} action, {report.counts.attention} attention, {report.counts.info} info</>
                      )}
                    </p>
                    {ageDays !== null && ageDays > STALE_DAYS && (
                      <p className="text-sm font-medium">
                        ⚠ The last check is {Math.floor(ageDays)} days old — the monthly check may not be running.
                      </p>
                    )}
                    {report.packagesFrom && (
                      <p className="text-xs opacity-80">Package results are from the check of {fmt(report.packagesFrom)}.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {byLevel("action").length > 0 && (
              <Section title="Immediate action required">
                <FindingList findings={byLevel("action")} tone="action" />
              </Section>
            )}
            {byLevel("attention").length > 0 && (
              <Section title="Should be fixed soon">
                <FindingList findings={byLevel("attention")} tone="attention" />
              </Section>
            )}

            <Section title="Platform checks">
              <ul className="divide-y rounded-lg border bg-card">
                {report.platform.map((c) => (
                  <li key={c.id} className="flex gap-3 px-4 py-2.5">
                    {c.ok
                      ? <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-green-600" aria-label="Passed" />
                      : c.level === "info"
                        ? <Info className="size-4 mt-0.5 shrink-0 text-muted-foreground" aria-label="Note" />
                        : <XCircle className={cn("size-4 mt-0.5 shrink-0", c.level === "action" ? "text-red-600" : "text-crafd-yellow-900")} aria-label="Failed" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Packages">
              {!report.packages ? (
                <p className="text-sm text-muted-foreground">No package results yet — they come from the monthly check script.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Checked {fmt(report.packages.generatedAt)}
                    {report.packages.node && <> · Node {report.packages.node}</>}
                    {report.packages.npm && <> · npm {report.packages.npm}</>}
                    {report.packages.commit && <> · code version {report.packages.commit.slice(0, 7)}</>}
                  </p>
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Known vulnerabilities ({vulns.length})</h3>
                    {vulns.length === 0 ? (
                      <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="size-4" /> None found.</p>
                    ) : (
                      <table className="w-full text-sm border rounded-lg overflow-hidden">
                        <thead className="bg-muted/50 text-left text-xs">
                          <tr><th className="px-3 py-2">Package</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Used by</th><th className="px-3 py-2">Fix</th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {vulns.map((v) => (
                            <tr key={v.name}>
                              <td className="px-3 py-2 font-medium">{v.name}</td>
                              <td className="px-3 py-2 capitalize">{v.severity}</td>
                              <td className="px-3 py-2">{v.production ? "Live site" : "Development tools"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{v.fix ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Updates available ({outdated.length})</h3>
                    {outdated.length === 0 ? (
                      <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Everything is up to date.</p>
                    ) : (
                      <table className="w-full text-sm border rounded-lg overflow-hidden">
                        <thead className="bg-muted/50 text-left text-xs">
                          <tr><th className="px-3 py-2">Package</th><th className="px-3 py-2">Installed</th><th className="px-3 py-2">Safe update</th><th className="px-3 py-2">Latest</th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {outdated.map((p) => (
                            <tr key={p.name}>
                              <td className="px-3 py-2 font-medium">{p.name}{p.dev && <span className="ml-1 text-xs text-muted-foreground">(dev)</span>}</td>
                              <td className="px-3 py-2 tabular-nums">{p.current}</td>
                              <td className="px-3 py-2 tabular-nums">{p.wanted !== p.current ? p.wanted : "—"}</td>
                              <td className="px-3 py-2 tabular-nums">{p.latest}{p.major && <span className="ml-1 text-xs text-muted-foreground">(major)</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {byLevel("info").length > 0 && (
              <Section title="For information">
                <FindingList findings={byLevel("info")} tone="info" />
              </Section>
            )}

            <Section title="History">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted/50 text-left text-xs">
                  <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Run</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Findings</th></tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(h.runAt)}</td>
                      <td className="px-3 py-2">{SOURCE_LABEL[h.source] ?? h.source}</td>
                      <td className="px-3 py-2"><StatusPill status={h.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {h.counts ? `${h.counts.action} action · ${h.counts.attention} attention · ${h.counts.info} info` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )}
        {!loading && available && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="size-3.5" /> The full check runs on the 1st of every month. Platform results describe the server this page runs on.
          </p>
        )}
      </div>
    </div>
  );
}
