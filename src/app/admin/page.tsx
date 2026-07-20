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
  Contact,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportStatusStyle } from "@/lib/reports";
import { timeAgo } from "@/lib/utils";
import { CommentContextBadges } from "@/components/comment-context-badges";
import type { Report } from "@/lib/types";

type ReportRow = Report;

// A report augmented with the most recent partner-edit time (from /api/reports/activity).
type ActivityReport = ReportRow & { last_activity: string };

// Admin-scoped comment awaiting CRAF'd review (partner marked it addressed).
interface ReviewComment {
  id: number;
  section: string;
  body: string;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string | null;
  item_label: string | null;
}

interface StatsData {
  totalReports: number;
  authorizedReports: number;
  pendingReports: number;
  totalPartners: number;
  totalProjects: number;
  totalContacts: number;
  resolvedComments: number;
  totalComments: number;
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
    href: "/admin/reports",
    label: "Reports",
    description: "Manage reporting periods",
    icon: ClipboardList,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: "totalReports" as const,
  },
  {
    href: "/admin/comments",
    label: "Comments",
    description: "Manage resolve Comments",
    icon: MessageSquare,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: null,
    // Shows resolved/total rather than a plain count.
    ratioKeys: ["resolvedComments", "totalComments"] as const,
  },
  {
    href: "/admin/contacts",
    label: "Contacts",
    description: "Manage partner contacts",
    icon: Contact,
    card: "bg-amber-50 border-amber-200 text-amber-700",
    iconClass: "text-amber-500",
    countKey: "totalContacts" as const,
  },
];

export default function AdminHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityReport[]>([]);
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good day");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function loadStats() {
      try {
        const [rRes, pRes, prRes, ctRes, aRes, cRes] = await Promise.all([
          fetch("/api/reports?data_type=report"),
          fetch("/api/partners"),
          fetch("/api/projects"),
          fetch("/api/partner-contacts"),
          fetch("/api/reports/activity?limit=6"),
          fetch("/api/comments?scope=admin"),
        ]);
        const reports: ReportRow[] = rRes.ok ? await rRes.json() : [];
        const partners: unknown[] = pRes.ok ? await pRes.json() : [];
        const projects: unknown[] = prRes.ok ? await prRes.json() : [];
        const contacts: unknown[] = ctRes.ok ? await ctRes.json() : [];
        const activity: ActivityReport[] = aRes.ok ? await aRes.json() : [];
        const allComments: (ReviewComment & { resolved: boolean; partner_addressed: boolean })[] =
          cRes.ok ? await cRes.json() : [];

        const authorized = reports.filter((r) => r.authorized).length;
        const recent = [...reports]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        // Comments the partner has marked addressed but CRAF'd hasn't confirmed yet
        // — mirrors the "Completed by partner" bucket on the Comments tab.
        const toReview = allComments.filter((c) => c.partner_addressed && !c.resolved);

        setStats({
          totalReports: reports.length,
          authorizedReports: authorized,
          pendingReports: reports.length - authorized,
          totalPartners: partners.length,
          totalProjects: projects.length,
          totalContacts: contacts.length,
          resolvedComments: allComments.filter((c) => c.resolved).length,
          totalComments: allComments.length,
          recentReports: recent,
        });
        setRecentActivity(activity);
        setReviewComments(toReview);
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
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {quickLinks.map((link) => {
              const { href, label, description, icon: Icon, card, iconClass, countKey } = link;
              const ratioKeys = "ratioKeys" in link ? link.ratioKeys : null;
              const count = countKey && stats ? stats[countKey] : null;
              const ratio = ratioKeys && stats ? `${stats[ratioKeys[0]]}/${stats[ratioKeys[1]]}` : null;
              const display = ratio ?? (count != null ? String(count) : null);
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
                    {display != null && (
                      <p className="text-2xl font-bold font-qanelas leading-none shrink-0 tabular-nums">
                        {loading ? <span className="inline-block w-6 h-6 bg-current opacity-10 animate-pulse rounded" /> : display}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two columns: recent partner activity (left) · comments to review (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: reports by most recent partner edit ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                Recently Edited
              </h2>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push("/admin/reports")}>
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
            ) : recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                No reports yet.
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {recentActivity.map((r) => {
                  const slug = (r.project_short_name ?? r.project_title).toLowerCase().replace(/\s+/g, "-");
                  return (
                    <button
                      key={r.id}
                      onClick={() => router.push(`/admin/report-editor/${slug}/${r.year}/overview`)}
                      className="group w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.project_title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {r.partner_short_name} &middot; {r.year}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                        {mounted ? timeAgo(r.last_activity) : ""}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border shrink-0 ${reportStatusStyle(r.status)}`}>
                        {r.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: comments the partner addressed, awaiting CRAF'd review ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                Awaiting Your Review
              </h2>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push("/admin/comments")}>
                View all <ArrowRight className="size-3 ml-1" />
              </Button>
            </div>

            {loading ? (
              <div className="rounded-xl border bg-card divide-y">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="px-5 py-3.5 space-y-1.5">
                    <div className="h-3.5 w-56 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            ) : reviewComments.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                Nothing awaiting your review.
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {reviewComments.map((c) => {
                  const slug = (c.project_short_name ?? c.project_title).toLowerCase().replace(/\s+/g, "-");
                  return (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/admin/report-editor/${slug}/${c.year}/${c.section}`)}
                      className="group w-full px-5 py-3.5 flex items-start gap-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                    >
                      <MessageSquare className="size-4 mt-0.5 shrink-0 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2">{c.body}</p>
                        <CommentContextBadges
                          partner={c.partner_short_name}
                          reportType={c.report_type}
                          year={c.year}
                          project={c.project_short_name ?? c.project_title}
                          section={c.section}
                          itemLabel={c.item_label}
                          className="!gap-1 mt-1.5"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
