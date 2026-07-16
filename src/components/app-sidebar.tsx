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
  FileStack,
  Edit,
  BarChart3,
  UploadCloud,
  Target,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { REPORT_SECTIONS, parseReportPath } from "@/lib/report-sections";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const administrationLinks = [
  { href: "/admin/partners", label: "Partners", icon: Building2 },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/prodoc", label: "Project Documents", icon: FileStack },
  { href: "/admin/indicators", label: "Indicators", icon: Target },
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
];

const editorLinks = [
  { href: "/admin/report-editor", label: "Report Editor", icon: Edit },
  { href: "/admin/prodoc-editor", label: "Project Document Editor", icon: Edit },
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
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {[
            {
              href: "/partner",
              label: "Home",
              icon: Home,
              isActive: (p: string) => p === "/partner",
            },
            {
              href: "/partner/dashboard",
              label: "Reporting",
              icon: FileText,
              isActive: (p: string) => p.startsWith("/partner/dashboard"),
            },
            {
              href: "/partner/report-editor",
              label: "Report Editor",
              icon: Edit,
              isActive: (p: string) =>
                p.startsWith("/partner/report-editor") ||
                (p.startsWith("/partner/") &&
                  p.split("/").filter(Boolean).length >= 4),
            },
          ].map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            // When inside a report, the Report Editor entry expands into a
            // sub-menu of every section so the sidebar can navigate the report too.
            const isEditor = href === "/partner/report-editor";
            const report = isEditor ? parseReportPath(pathname) : null;
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

                {report && (() => {
                  // Level 1 = every report the partner can edit; level 2 = the
                  // sections of the report currently open. Fall back to a synthetic
                  // entry from the URL until the report list loads.
                  const items: { slug: string; year: number; primary: string; secondary: string; isActive: boolean }[] =
                    (reports.length > 0
                      ? reports.map((r) => ({
                          slug: reportSlug(r),
                          year: r.year,
                          primary: `${r.report_type ?? "annual"} Report ${r.year}`,
                          secondary: r.project_short_name || r.project_title,
                          isActive: reportSlug(r) === report.project && String(r.year) === report.year,
                        }))
                      : [{ slug: report.project, year: Number(report.year), primary: `Report ${report.year}`, secondary: report.project, isActive: true }]);

                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
                      {items.map((it) => (
                        <div key={`${it.slug}-${it.year}`}>
                          {/* Level 1: report — click to jump, keeping the current section */}
                          <Link
                            href={`/partner/${it.slug}/${it.year}/${report.section}`}
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

                          {/* Level 2: sections of the open report */}
                          {it.isActive && (
                            <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
                              {REPORT_SECTIONS.map((s) => {
                                const secActive = report.section === s.value;
                                return (
                                  <Link
                                    key={s.value}
                                    href={`/partner/${it.slug}/${it.year}/${s.value}`}
                                    className={cn(
                                      "rounded-md px-3 py-1.5 text-[12px] transition-colors",
                                      secActive
                                        ? "bg-crafd-yellow/10 text-crafd-yellow font-medium"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                    )}
                                  >
                                    {s.label}
                                  </Link>
                                );
                              })}
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
