"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  LogOut,
  User,
  FileText,
  ClipboardList,
  Home,
  Building2,
  FolderKanban,
  ChevronLeft,
  ChevronRight,
  Edit,
  BarChart3,
  UploadCloud,
  Target,
  Check,
  Contact,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { REPORT_SECTION_GROUPS, parseReportPath } from "@/lib/report-sections";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const administrationLinks = [
  { href: "/admin/partners", label: "Partners", icon: Building2 },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
  { href: "/admin/contacts", label: "Contacts", icon: Contact },
];

const editorLinks = [
  { href: "/admin/prodoc-editor", label: "Project Document Editor", icon: Edit },
  { href: "/admin/report-editor", label: "Report Editor", icon: Edit },
  { href: "/admin/indicators", label: "Indicators", icon: Target },
  { href: "/admin/comments", label: "Comments", icon: MessageSquare },
];

const dataLinks = [
  { href: "/admin/data", label: "Full Data", icon: Database },
  { href: "/admin/dashboards", label: "Dashboards", icon: BarChart3 },
  { href: "/admin/upload", label: "Upload / Download", icon: UploadCloud },
];


interface SidebarReport {
  id: number;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [logoFailed, setLogoFailed] = useState(false);
  const [reports, setReports] = useState<SidebarReport[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPartner = user?.role === "partner";

  // Partner reports drive the report-editor sub-menu (level 1 = report, level 2 =
  // sections). Fetched once; the sidebar persists across section navigation.
  useEffect(() => {
    if (!mounted || !isPartner || !user) return;
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: SidebarReport[]) => {
        const filtered = Array.isArray(all)
          ? all.filter(
              (r) =>
                r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
                r.partner_short_name === user.organization
            )
          : [];
        filtered.sort(
          (a, b) =>
            (a.project_short_name ?? a.project_title).localeCompare(b.project_short_name ?? b.project_title) ||
            b.year - a.year
        );
        setReports(filtered);
      })
      .catch(() => {});
  }, [mounted, isPartner, user]);

  const reportSlug = (r: SidebarReport) => (r.project_short_name ?? r.project_title).toLowerCase();

  // Per-section completion for the report currently open (drives the checkmarks).
  // Refetched when the section path changes so a check appears once a section is
  // filled out and the user navigates on.
  const [sectionComplete, setSectionComplete] = useState<Record<string, boolean>>({});
  const openReport = isPartner ? parseReportPath(pathname) : null;
  const activeReportId = openReport
    ? reports.find((r) => reportSlug(r) === openReport.project && String(r.year) === openReport.year)?.id ?? null
    : null;

  useEffect(() => {
    if (activeReportId == null) { setSectionComplete({}); return; }
    fetch(`/api/report-completion?reportId=${activeReportId}`)
      .then((r) => r.json())
      .then((d) => setSectionComplete(d.sections ?? {}))
      .catch(() => {});
  }, [activeReportId, pathname]);

  return (
    <div className="relative shrink-0">
    <aside className={cn(
      "flex h-screen flex-col border-r border-border bg-sidebar overflow-hidden transition-all duration-300 ease-in-out",
      isOpen ? "w-64" : "w-0"
    )}>
      <div className="flex items-center gap-3 px-6 h-32">
        <Image
          src="/images/crafd-logo-full-black.svg"
          alt="CRAF'd"
          width={140}
          height={92}
          priority
        />
      </div>

      <Separator />

      {!mounted ? (
        <nav className="flex-1 space-y-1 px-3 py-4" />
      ) : isPartner ? (
        <nav className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-1">
          {[
            {
              href: "/partner",
              label: "Home",
              icon: Home,
              isActive: (p: string) => p === "/partner",
            },
            {
              href: "/partner/report-editor",
              label: "Report Editor",
              icon: FileText,
              isActive: (p: string) =>
                p.startsWith("/partner/report-editor") ||
                (p.startsWith("/partner/") &&
                  p.split("/").filter(Boolean).length >= 4),
            },
            {
              href: "/partner/contacts",
              label: "Contact Information",
              icon: Contact,
              isActive: (p: string) => p.startsWith("/partner/contacts"),
            },
          ].map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            // The Report Editor entry expands into a sub-menu of the partner's
            // reports (level 1). While a report is open, that report also expands
            // into its sections (level 2). The report list also shows on the
            // report-editor landing page so the reports are visible up front.
            const isEditor = href === "/partner/report-editor";
            const report = isEditor ? parseReportPath(pathname) : null;
            const showReports = isEditor && (!!report || pathname.startsWith("/partner/report-editor"));
            return (
              <div key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-crafd-yellow/10 text-crafd-yellow"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </Link>

                {showReports && (() => {
                  // Level 1 = every report the partner can edit; level 2 = the
                  // sections of the report currently open (if any). Fall back to a
                  // synthetic entry from the URL until the report list loads.
                  const targetSection = report?.section ?? "overview";
                  const items: { slug: string; year: number; primary: string; secondary: string; isActive: boolean }[] =
                    (reports.length > 0
                      ? reports.map((r) => ({
                          slug: reportSlug(r),
                          year: r.year,
                          primary: `${r.report_type ?? "annual"} Report ${r.year}`,
                          secondary: r.project_short_name || r.project_title,
                          isActive: !!report && reportSlug(r) === report.project && String(r.year) === report.year,
                        }))
                      : report
                      ? [{ slug: report.project, year: Number(report.year), primary: `Report ${report.year}`, secondary: report.project, isActive: true }]
                      : []);

                  if (items.length === 0) return null;

                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {items.map((it) => (
                        <div key={`${it.slug}-${it.year}`}>
                          {/* Level 1: report — click to open (keeps the current section) */}
                          <Link
                            href={`/partner/${it.slug}/${it.year}/${targetSection}`}
                            className={cn(
                              "flex flex-col rounded-md px-3 py-1.5 transition-colors",
                              it.isActive
                                ? "bg-crafd-yellow/10 text-crafd-yellow"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <span className="truncate text-[12px] font-medium capitalize">{it.primary}</span>
                            <span className="truncate text-[10px] opacity-70">{it.secondary}</span>
                          </Link>

                          {/* Level 2: sections of the open report, split into
                              Qualitative / Quantitative groups. */}
                          {it.isActive && report && (
                            <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
                              {REPORT_SECTION_GROUPS.map((grp) => (
                                <div key={grp.label} className="flex flex-col gap-0.5">
                                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                    {grp.label}
                                  </p>
                                  {grp.sections.map((s) => {
                                    const secActive = report.section === s.value;
                                    return (
                                      <Link
                                        key={s.value}
                                        href={`/partner/${it.slug}/${it.year}/${s.value}`}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] transition-colors",
                                          secActive
                                            ? "bg-crafd-yellow/10 text-crafd-yellow font-medium"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                        )}
                                      >
                                        <span className="flex-1 truncate">{s.label}</span>
                                        {sectionComplete[s.value] && (
                                          <Check className="size-3.5 shrink-0 text-green-600" />
                                        )}
                                      </Link>

                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </nav>
      ) : (
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mb-2",
              pathname === "/admin"
                ? "bg-crafd-yellow/10 text-crafd-yellow"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Home className="size-4" />
            Home
          </Link>

          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          {administrationLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-crafd-yellow/10 text-crafd-yellow"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            );
          })}

          <p className="mb-2 mt-8 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Editor
          </p>
          {editorLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-crafd-yellow/10 text-crafd-yellow"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            );
          })}

          <p className="mb-2 mt-8 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data
          </p>
          {dataLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-crafd-yellow/10 text-crafd-yellow"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      <Separator />

      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          {mounted && user?.role === "partner" && user.organization && !logoFailed ? (
            <img
              src={`/logos/${user.organization.toLowerCase()}.webp`}
              alt={user.organization}
              className="w-9 h-9 object-contain bg-muted rounded"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Avatar className="size-9">
              <AvatarFallback className="bg-crafd-yellow text-black text-xs font-bold">
                {mounted && user?.name ? user.name.charAt(0) : <User className="size-4" />}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {mounted && user?.role ? (user.role === "admin" ? (user.organization || "CRAF'd") : user.organization) : ""}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {mounted && user?.role ? user.role : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
            className="shrink-0"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 z-20 flex items-center justify-center w-5 h-10 bg-sidebar border border-l-0 border-border rounded-r-md hover:bg-accent transition-colors"
      aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      {isOpen ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}
    </button>
    </div>
  );
}
