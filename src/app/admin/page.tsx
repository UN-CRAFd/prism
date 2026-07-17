"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ClipboardList,
  Building2,
  FolderKanban,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Users,
  FileStack,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportRow {
  id: number;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  year: number;
  status: "Open" | "Closed" | "Under Review";
  authorized: boolean;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  Open:           "bg-blue-50 text-blue-700 border-blue-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Closed:         "bg-zinc-100 text-zinc-500 border-zinc-200",
};

interface StatsData {
  totalReports: number;
  authorizedReports: number;
  pendingReports: number;
  totalPartners: number;
  totalProjects: number;
  recentReports: ReportRow[];
}

const quickLinks = [
  {
    href: "/admin/partners",
    label: "Partners",
    description: "Manage partner organizations",
    icon: Building2,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: "totalPartners" as const,
  },
  {
    href: "/admin/projects",
    label: "Projects",
    description: "Manage project entries",
    icon: FolderKanban,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: "totalProjects" as const,
  },
  {
    href: "/admin/prodoc",
    label: "Project Documents",
    description: "Manage project documents",
    icon: FileStack,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: null,
  },
  {
    href: "/admin/reports",
    label: "Reports",
    description: "Manage reporting periods",
    icon: ClipboardList,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: "totalReports" as const,
  },
];

export default function AdminHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good day");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function loadStats() {
      try {
        const [rRes, pRes, prRes] = await Promise.all([
          fetch("/api/reports?data_type=report"),
          fetch("/api/partners"),
          fetch("/api/projects"),
        ]);
        const reports: ReportRow[] = rRes.ok ? await rRes.json() : [];
        const partners: unknown[] = pRes.ok ? await pRes.json() : [];
        const projects: unknown[] = prRes.ok ? await prRes.json() : [];

        const authorized = reports.filter((r) => r.authorized).length;
        const recent = [...reports]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        setStats({
          totalReports: reports.length,
          authorizedReports: authorized,
          pendingReports: reports.length - authorized,
          totalPartners: partners.length,
          totalProjects: projects.length,
          recentReports: recent,
        });
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    loadStats();

    // Calculate greeting on client only to avoid hydration mismatch
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const statCards = [
    { label: "Total Reports",  value: stats?.totalReports,       icon: ClipboardList, color: "text-blue-600" },
    { label: "Authorized",     value: stats?.authorizedReports,  icon: CheckCircle2,  color: "text-green-600" },
    { label: "Pending",        value: stats?.pendingReports,     icon: Clock,         color: "text-amber-600" },
    { label: "Partners",       value: stats?.totalPartners,      icon: Users,         color: "text-violet-600" },
    { label: "Projects",       value: stats?.totalProjects,      icon: FolderKanban,  color: "text-emerald-600" },
  ];

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.1</p>
        <h1 className="text-3xl font-bold font-qanelas">
          {mounted ? `${greeting}, ${user?.name ?? "Admin"}` : "Good day, Admin"}
        </h1>
        <p className="text-neutral-400 text-sm mt-2">
          Administrator Dashboard
        </p>
      </div>

      <div className="flex-1 px-8 py-8 space-y-8">

        {/* Stat cards */}
        <div className="grid grid-cols-5 gap-4 hidden">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
              <Icon className={`size-5 shrink-0 ${color}`} />
              <div className="min-w-0">
                <p className="text-xl font-bold">
                  {loading
                    ? <span className="inline-block w-8 h-5 bg-muted animate-pulse rounded" />
                    : (value ?? "0")}
                </p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick access */}
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {quickLinks.map(({ href, label, description, icon: Icon, card, iconClass, countKey }) => {
              const count = countKey && stats ? stats[countKey] : null;
              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`group rounded-xl border p-4 text-left transition-colors hover:bg-opacity-80 cursor-pointer ${card}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`size-6 shrink-0 ${iconClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs mt-0.5 opacity-70">{description}</p>
                    </div>
                    {count != null && (
                      <p className="text-2xl font-bold font-qanelas leading-none shrink-0">
                        {loading ? <span className="inline-block w-6 h-6 bg-current opacity-10 animate-pulse rounded" /> : count}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent reports */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              Recent Reports
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => router.push("/admin/reports")}
            >
              View all <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>

          {loading ? (
            <div className="rounded-xl border bg-card divide-y">
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-48 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : !stats || stats.recentReports.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              No reports yet.
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              {stats.recentReports.map((r) => {
                const slug = (r.project_short_name ?? r.project_title).toLowerCase().replace(/\s+/g, "-");
                return (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/admin/report-editor/${slug}/${r.year}/surveys`)}
                    className="group w-full px-5 py-3.5 flex items-center gap-4 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.project_title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.partner_short_name} &middot; {r.year}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border shrink-0 ${STATUS_STYLES[r.status] ?? STATUS_STYLES.Closed}`}>
                      {r.status}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
