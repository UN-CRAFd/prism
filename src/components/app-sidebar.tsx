"use client";

import { useState, useEffect, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LogOut,
  User,
  FileText,
  ClipboardList,
  Home,
  Building2,
  FolderKanban,
  FileStack,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Edit,
  BarChart3,
  Check,
  Contact,
  MessageSquare,
  BookOpen,
  Settings,
  FilePen,
  Database,
  History,
  UploadCloud,
  Target,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { REPORT_SECTIONS, REPORT_SECTION_GROUPS, GROUP_STYLES, parseReportPath, parseUpdatePath, countsTowardProgress } from "@/lib/report-sections";
import { UPDATE_SECTIONS, updateSectionGroups } from "@/lib/update-sections";
import { DOC_ID_PARAM, documentPath, documentTitle, firstUnlockedSection, resolveDocument } from "@/lib/project-updates";
import { PRODOC_SECTIONS, partnerProdocSections } from "@/lib/prodoc-sections";
import { numberWikiSections } from "@/lib/wiki";
import { cn, projectSlug, shortName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Full-name tooltip for a truncated label — the same Tooltip the editor headers
// use on their document titles (default delay, always available on hover).
function NameTip({ text, children }: { text: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

// Active nav item style, shared by every level of the partner and admin sidebars.
const NAV_ACTIVE = "bg-crafd-yellow-light text-black";
// A parent row whose nested row is the active one: bold, no fill, so only the
// deepest active item carries the yellow background.
const NAV_PARENT_ACTIVE = "text-black font-semibold";

// The guide is a single long page; sub-links scroll to section anchors on it.
// The section list is DB-driven (wiki_sections, editable at /admin/guide) — the
// sidebar fetches it so nav stays in sync as admins add/reorder/hide/rename.
// `number` mirrors the ordinal shown on the guide page (null for hidden
// sections, which only admins receive) — see numberWikiSections in lib/wiki.
type WikiSubLink = { hash: string; label: string; number: string | null };

// Admin nav: flat links under small group headings. `also` lists extra path
// prefixes that keep an item active (the editors live under their list's entry).
type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  also?: string[];
};

const adminNavGroups: { heading?: string; items: AdminNavItem[] }[] = [
  {
    heading: "Administration",
    items: [
      { href: "/admin/partners", label: "Partners", icon: Building2 },
      { href: "/admin/contacts", label: "Contacts", icon: Contact },
    ],
  },
  {
    heading: "Editor",
    items: [
      { href: "/admin/projects", label: "Project Documents", icon: FolderKanban, also: ["/admin/prodoc-editor"] },
      { href: "/admin/reports", label: "Project Reports", icon: ClipboardList, also: ["/admin/report-editor"] },
      { href: "/admin/project-updates", label: "Project Updates", icon: FilePen, also: ["/admin/project-update-editor"] },
      { href: "/admin/indicators", label: "Indicators", icon: Target },
      { href: "/admin/survey-questions", label: "Survey Questions", icon: ListChecks },
      { href: "/admin/narrative-questions", label: "Narrative Questions", icon: FileText },
      { href: "/admin/hact-recommendations", label: "HACT Recommendations", icon: ShieldCheck },
      { href: "/admin/comments", label: "Comments", icon: MessageSquare },
      { href: "/admin/guide", label: "Guide", icon: BookOpen },
    ],
  },
  {
    heading: "Data",
    items: [
      { href: "/admin/data", label: "Full Data", icon: Database },
      { href: "/admin/dashboards", label: "Dashboards", icon: BarChart3 },
      { href: "/admin/version-log", label: "Version Log", icon: History },
      { href: "/admin/upload", label: "Upload / Download", icon: UploadCloud },
    ],
  },
  // Settings sits on its own at the bottom, outside any group.
  { items: [{ href: "/admin/settings", label: "Settings", icon: Settings }] },
];

interface SidebarReport {
  id: number;
  year: number;
  project_id: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface UpdateSidebarReport {
  id: number;
  year: number;
  data_type: string;
  /** Distinguishes several updates in one year — see lib/project-updates. */
  update_index?: string | null;
  /** The update types — documentTitle() names the update from these. */
  update_types?: string[] | null;
  project_title: string;
  project_short_name: string | null;
  unlocked_sections: string[];
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  // Tracks the guide anchor currently in the URL so the matching sub-link stays
  // highlighted (the pathname alone can't distinguish guide sections).
  const [wikiHash, setWikiHash] = useState("");
  // Guide sub-links, loaded from the DB (non-hidden sections, in order).
  const [wikiSections, setWikiSections] = useState<WikiSubLink[]>([]);
  // Partner logo file may be .webp or .png; step through both before falling
  // back to the initial avatar.
  const [logoExt, setLogoExt] = useState<"webp" | "png" | "none">("webp");
  const [reports, setReports] = useState<SidebarReport[]>([]);
  const [prodocs, setProdocs] = useState<SidebarReport[]>([]);
  // Whether any project document / reporting-year report exists in the viewer's
  // scope. Drives whether the two editor nav entries appear (hidden when empty).
  // `null` = not yet loaded, so we don't flash-hide before the fetch resolves.
  const [hasProdocs, setHasProdocs] = useState<boolean | null>(null);
  const [hasReports, setHasReports] = useState<boolean | null>(null);
  // Set from the partner update list below for partners, and from the admin
  // count fetch for admins — whichever role is viewing.
  const [hasUpdates, setHasUpdates] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load the guide section list (DB-driven sub-links). Fetched once mounted; the
  // API filters hidden sections for non-admins.
  useEffect(() => {
    if (!mounted) return;
    fetch("/api/wiki-sections")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { slug: string; title: string; hidden: boolean }[]) => {
        if (Array.isArray(rows)) {
          setWikiSections(
            numberWikiSections(rows).map((s) => ({
              hash: s.slug,
              label: s.title,
              number: s.number,
            }))
          );
        }
      })
      .catch(() => {});
  }, [mounted]);

  // On the single-page guide, keep the active sub-link in sync with what's
  // actually on screen: the active section is the last one whose heading has
  // scrolled up under the sticky 128px header. hashchange covers browser
  // back/forward. Elsewhere, just mirror the URL hash.
  //
  // Three things this has to survive, all of which broke the previous
  // IntersectionObserver version:
  //  1. The guide fetches its own sections and shows a spinner meanwhile, so
  //     its `<section id="…">` anchors are NOT in the DOM when this effect
  //     runs on a client-side navigation, and neither dependency changes
  //     afterwards to trigger a retry. Resolving the anchors on every pass
  //     instead of binding them once means late-mounting sorts itself out.
  //  2. An observer callback only reports entries whose intersection actually
  //     changed, so scrolling one section out delivered a single
  //     non-intersecting entry, matched nothing, and left the highlight stuck.
  //     Recomputing all positions each pass has no such gap.
  //  3. The scroll happens on the `<main>` element in the layout, not the
  //     window — scroll events don't bubble, so the listener is registered in
  //     the capture phase to see them.
  useEffect(() => {
    if (pathname !== "/partner/wiki") {
      setWikiHash(window.location.hash.slice(1));
      return;
    }

    const sync = () => setWikiHash(window.location.hash.slice(1));
    sync();
    window.addEventListener("hashchange", sync);

    const HEADER_OFFSET = 128;
    let frame = 0;

    const update = () => {
      frame = 0;
      let active = "";
      for (const s of wikiSections) {
        const el = document.getElementById(s.hash);
        if (!el) continue;
        // Before any heading has reached the header line, the first section
        // is the one being read.
        if (!active) active = s.hash;
        if (el.getBoundingClientRect().top <= HEADER_OFFSET + 1) active = s.hash;
      }
      // Empty while the guide is still loading — leave the hash alone so we
      // don't clobber a deep link before the anchors exist.
      if (active) setWikiHash(active);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    // Arriving at the top of the guide fires no scroll event, so if the
    // sections mount after the update() above, nothing would set the initial
    // highlight until the user scrolled. Watch for them appearing, run once,
    // then stop.
    let mutations: MutationObserver | null = null;
    const anchorsPresent = () =>
      wikiSections.some((s) => document.getElementById(s.hash));
    if (wikiSections.length > 0 && !anchorsPresent()) {
      mutations = new MutationObserver(() => {
        if (!anchorsPresent()) return;
        update();
        mutations?.disconnect();
        mutations = null;
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      mutations?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname, wikiSections]);

  const isPartner = user?.role === "partner";

  // Partner reports drive the report-editor sub-menu (level 1 = report, level 2 =
  // sections). Fetched once; the sidebar persists across section navigation.
  useEffect(() => {
    if (!mounted || !isPartner || !user) return;
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: SidebarReport[]) => {
        const items = Array.isArray(all) ? [...all] : [];
        items.sort(
          (a, b) =>
            (a.project_short_name ?? a.project_title).localeCompare(b.project_short_name ?? b.project_title) ||
            b.year - a.year
        );
        setReports(items);
        setHasReports(items.length > 0);
      })
      .catch(() => {});
  }, [mounted, isPartner, user]);

  // Partner project updates drive the project-updates sub-menu. Separate fetch so
  // the report sub-menu is unaffected.
  useEffect(() => {
    if (!mounted || !isPartner || !user) return;
    fetch("/api/reports?data_type=update")
      .then((r) => r.json())
      .then((all: UpdateSidebarReport[]) => {
        const items = Array.isArray(all) ? [...all] : [];
        items.sort(
          (a, b) =>
            (a.project_short_name ?? a.project_title).localeCompare(b.project_short_name ?? b.project_title) ||
            b.year - a.year
        );
        setUpdates(items);
        setHasUpdates(items.length > 0);
      })
      .catch(() => {});
  }, [mounted, isPartner, user]);

  // Editor nav visibility: the partner "Project Document" entry only appears once
  // at least one prodoc exists in the viewer's scope. The reports API is
  // session-scoped server-side, so a partner sees only their own.
  useEffect(() => {
    if (!mounted || !user) return;
    fetch("/api/reports?data_type=prodoc")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list: SidebarReport[] = Array.isArray(rows) ? rows : [];
        setProdocs(list);
        setHasProdocs(list.length > 0);
      })
      .catch(() => {});
  }, [mounted, isPartner, user]);

  const reportSlug = (r: SidebarReport) => projectSlug(r.project_short_name, r.project_title);

  // Per-section completion for the report currently open (drives the checkmarks).
  // Refetched when the section path changes so a check appears once a section is
  // filled out and the user navigates on.
  const [sectionComplete, setSectionComplete] = useState<Record<string, boolean>>({});
  const [prodocSectionComplete, setProdocSectionComplete] = useState<{ projectId: number; sections: Record<string, boolean> } | null>(null);
  const [reportSectionsCollapsed, setReportSectionsCollapsed] = useState(false);
  const [prodocSectionsCollapsed, setProdocSectionsCollapsed] = useState(false);
  const [updates, setUpdates] = useState<UpdateSidebarReport[]>([]);
  const [updateSectionComplete, setUpdateSectionComplete] = useState<Record<string, boolean>>({});
  const [updateSectionsCollapsed, setUpdateSectionsCollapsed] = useState(false);
  const prodocItems = Array.from(
    new Map(prodocs.map((p) => [reportSlug(p), p])).values()
  );
  const prodocParts = pathname.split("/").filter(Boolean);
  const inProdoc = pathname.startsWith(isPartner ? "/partner/prodoc-editor/" : "/admin/prodoc-editor/");
  const openProdocSlug = inProdoc ? prodocParts[2] ?? null : null;
  const openProdocSection = (inProdoc ? prodocParts[3] : null) ?? "general";
  const openProdocRow = prodocItems.find((p) => projectSlug(p.project_short_name, p.project_title) === openProdocSlug) ?? null;

  const openReport = isPartner ? parseReportPath(pathname) : null;

  // Admin: /admin/report-editor/{project}/{year}/{section}. The one open report is
  // resolved with the same resolver the editor uses, so the sidebar and the page
  // can never disagree about which report is open.
  const adminParts = !isPartner && pathname.startsWith("/admin/report-editor/") ? pathname.split("/").filter(Boolean) : [];
  const openAdminReport =
    adminParts.length >= 5 && /^\d{4}$/.test(adminParts[3])
      ? { project: adminParts[2], year: adminParts[3], section: adminParts[4] }
      : null;
  const adminActiveReport = openAdminReport
    ? resolveDocument(
        reports.filter((r) => reportSlug(r) === openAdminReport.project && String(r.year) === openAdminReport.year),
        null
      ) ?? null
    : null;

  const activeReportId = openReport
    ? reports.find((r) => reportSlug(r) === openReport.project && String(r.year) === openReport.year)?.id ?? null
    : adminActiveReport?.id ?? null;
  const activeReportRow = activeReportId ? reports.find((r) => r.id === activeReportId) ?? null : null;

  const openUpdate = isPartner ? parseUpdatePath(pathname) : null;
  // Pinned by ?u=<id>: a year can hold several updates, so project+year alone
  // would pick a sibling — and this id drives the completion ticks below.
  // Admin: /admin/project-update-editor/{project}/{year}/{section}, pinned the same way.
  const adminUpdateParts = !isPartner && pathname.startsWith("/admin/project-update-editor/") ? pathname.split("/").filter(Boolean) : [];
  const openAdminUpdate =
    adminUpdateParts.length >= 5 && /^\d{4}$/.test(adminUpdateParts[3])
      ? { project: adminUpdateParts[2], year: adminUpdateParts[3], section: adminUpdateParts[4] }
      : null;
  const resolveOpenUpdate = (o: { project: string; year: string }) =>
    resolveDocument(
      updates.filter(
        (u) =>
          projectSlug(u.project_short_name, u.project_title) === o.project &&
          String(u.year) === o.year
      ),
      Number(searchParams.get(DOC_ID_PARAM))
    ) ?? null;
  const adminActiveUpdate = openAdminUpdate ? resolveOpenUpdate(openAdminUpdate) : null;
  const activeUpdateId = openUpdate
    ? resolveOpenUpdate(openUpdate)?.id ?? null
    : adminActiveUpdate?.id ?? null;
  const matchingProdoc = activeReportRow
    ? prodocItems.find((p) => p.project_title === activeReportRow.project_title) ?? null
    : null;
  const prodocNavHref = matchingProdoc
    ? `/partner/prodoc-editor/${projectSlug(matchingProdoc.project_short_name, matchingProdoc.project_title)}/general`
    : null;

  // Admin: load the report list once, when a report is first opened, to name it.
  const adminReportOpen = openAdminReport != null;
  useEffect(() => {
    if (!mounted || !user || isPartner || !adminReportOpen || reports.length > 0) return;
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: SidebarReport[]) => { if (Array.isArray(all)) setReports(all); })
      .catch(() => {});
  }, [mounted, user, isPartner, adminReportOpen, reports.length]);

  // Admin: load the update list once, when an update is first opened.
  const adminUpdateOpen = openAdminUpdate != null;
  useEffect(() => {
    if (!mounted || !user || isPartner || !adminUpdateOpen || updates.length > 0) return;
    fetch("/api/reports?data_type=update")
      .then((r) => r.json())
      .then((all: UpdateSidebarReport[]) => { if (Array.isArray(all)) setUpdates(all); })
      .catch(() => {});
  }, [mounted, user, isPartner, adminUpdateOpen, updates.length]);

  useEffect(() => {
    if (activeReportId == null) { setSectionComplete({}); return; }
    fetch(`/api/report-completion?reportId=${activeReportId}`)
      .then((r) => r.json())
      .then((d) => setSectionComplete(d.sections ?? {}))
      .catch(() => {});
  }, [activeReportId, pathname]);

  useEffect(() => {
    if (openProdocRow == null) { setProdocSectionComplete(null); return; }
    const projectId = openProdocRow.project_id;
    fetch(`/api/prodoc-completion?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setProdocSectionComplete({ projectId, sections: d.sections ?? {} }))
      .catch(() => {});
  }, [openProdocRow?.project_id, pathname]);

  // Tab list of an open project document, with completion ticks. Shared by the
  // partner and admin sidebars (the admin one also passes the admin-only tabs).
  const renderProdocSections = (basePath: string, slug: string, activeSection: string, sections: { value: string; label: string }[]) => (
    <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
      {sections.map((s) => {
        const secActive = activeSection === s.value;
        return (
          <Link
            key={s.value}
            href={`${basePath}/${slug}/${s.value}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              secActive
                ? `${NAV_ACTIVE} font-medium`
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <span className="flex-1 truncate">{s.label}</span>
            {prodocSectionComplete?.projectId === openProdocRow?.project_id && prodocSectionComplete?.sections[s.value] && (
              <Check className="size-3.5 shrink-0 text-green-600" />
            )}
          </Link>
        );
      })}
    </div>
  );

  // Section list of an open report, split into Qualitative / Quantitative groups,
  // with completion ticks. Shared by the partner and admin sidebars.
  const renderReportSections = (basePath: string, slug: string, year: number | string, activeSection: string) => (
    <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
      {REPORT_SECTION_GROUPS.map((grp, gi) => (
        <div key={grp.label} className="flex flex-col gap-0.5">
          <p className={cn(
            "px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wider",
            gi > 0 && "mt-2 border-t border-crafd-grey-100 pt-3",
            GROUP_STYLES[grp.label].header
          )}>
            {grp.label}
          </p>
          {grp.sections.map((s) => {
            const secActive = activeSection === s.value;
            return (
              <Link
                key={s.value}
                href={`${basePath}/${slug}/${year}/${s.value}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  secActive
                    ? cn(GROUP_STYLES[grp.label].sidebarActive, "font-medium")
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="flex-1 truncate">{s.label}</span>
                {countsTowardProgress(s.value) && sectionComplete[s.value] && (
                  <Check className="size-3.5 shrink-0 text-green-600" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  // Section list of an open project update: only the pages it unlocked, split into
  // Qualitative / Quantitative with the grey headings and dividers, with completion
  // ticks. Shared by the partner and admin sidebars.
  const renderUpdateSections = (
    basePath: string,
    update: { id: number; year: number; slug: string; unlocked: string[] },
    activeSection: string
  ) => {
    const groups = updateSectionGroups(UPDATE_SECTIONS.filter((s) => update.unlocked.includes(s.value)));
    return (
      <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
        {groups.map((grp, gi) => (
          <div key={grp.label} className="flex flex-col gap-0.5">
            <p className={cn(
              "px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wider",
              gi > 0 && "mt-2 border-t border-crafd-grey-100 pt-3",
              GROUP_STYLES[grp.label].header
            )}>
              {grp.label}
            </p>
            {grp.sections.map((s) => {
              const secActive = activeSection === s.value;
              return (
                <Link
                  key={s.value}
                  href={documentPath(basePath, { id: update.id, data_type: "update", year: update.year }, update.slug, s.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    secActive
                      ? cn(GROUP_STYLES[grp.label].sidebarActive, "font-medium")
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="flex-1 truncate">{s.label}</span>
                  {countsTowardProgress(s.value) && updateSectionComplete[s.value] && (
                    <Check className="size-3.5 shrink-0 text-green-600" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (activeUpdateId == null) { setUpdateSectionComplete({}); return; }
    fetch(`/api/report-completion?reportId=${activeUpdateId}`)
      .then((r) => r.json())
      .then((d) => setUpdateSectionComplete(d.sections ?? {}))
      .catch(() => {});
  }, [activeUpdateId, pathname]);

  return (
    // `no-print` only bites under body.guide-print (see globals.css), so printing
    // any other page is unchanged.
    <div className="no-print relative shrink-0">
    <aside className={cn(
      "flex h-screen flex-col border-r border-border bg-sidebar overflow-hidden transition-all duration-300 ease-in-out",
      isOpen ? "w-64" : "w-0"
    )}>
      <div className="flex shrink-0 items-center gap-3 px-6 h-24">
        <Image
          src="/images/crafd-logo-full-black.svg"
          alt="CRAF'd"
          width={92}
          height={60}
          className="h-auto w-[92px]"
          priority
        />
      </div>

      <Separator />

      {!mounted ? (
        <nav className="flex-1 min-h-0 space-y-1 px-3 py-4" />
      ) : isPartner ? (
        <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 py-4 space-y-1">
          {[
            {
              href: "/partner",
              label: "Home",
              icon: Home,
              isActive: (p: string) => p === "/partner",
            },
            // Project Document / Report Editor appear only once the partner has a
            // prodoc / report (hidden while `=== false`; shown until then to avoid
            // flashing them out before the fetch resolves).
            ...(hasProdocs !== false
              ? [{
                  href: "/partner/prodoc-editor",
                  label: "Project Document",
                  icon: FileStack,
                  isActive: (p: string) => p.startsWith("/partner/prodoc-editor"),
                }]
              : []),
            ...(hasReports !== false
              ? [{
                  href: "/partner/report-editor",
                  label: "Project Report",
                  icon: FileText,
                  isActive: (p: string) => p.startsWith("/partner/report-editor"),
                }]
              : []),
            ...(hasUpdates !== false
              ? [{
                  href: "/partner/project-updates",
                  label: "Project Update",
                  icon: FilePen,
                  isActive: (p: string) => p.startsWith("/partner/project-updates"),
                }]
              : []),
            {
              href: "/partner/contacts",
              label: "Contact Information",
              icon: Contact,
              isActive: (p: string) => p.startsWith("/partner/contacts"),
            },
            {
              href: "/partner/wiki",
              label: "Guide",
              icon: BookOpen,
              isActive: (p: string) => p.startsWith("/partner/wiki"),
            },
          ].map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            const isEditor = href === "/partner/report-editor";
            const isProdocEditor = href === "/partner/prodoc-editor";
            const isUpdateEditor = href === "/partner/project-updates";
            const isWiki = href === "/partner/wiki";
            const showWikiSubs = isWiki && pathname.startsWith("/partner/wiki");
            const report = isEditor ? parseReportPath(pathname) : null;
            const showReports = isEditor && (!!report || pathname.startsWith("/partner/report-editor"));
            const showProdocs = isProdocEditor && prodocItems.length > 0 && pathname.startsWith("/partner/prodoc-editor");
            const showUpdates = isUpdateEditor && updates.length > 0 && (!!openUpdate || pathname.startsWith("/partner/project-updates"));
            // Active top-level link with one of its own nested rows (project,
            // report or update) active too: that row takes the fill instead.
            const hasActiveNested =
              active &&
              ((showProdocs && prodocItems.some((p) => openProdocSlug === projectSlug(p.project_short_name, p.project_title))) ||
                (showReports && !!report) ||
                (showUpdates && updates.some((u) => u.id === activeUpdateId)));
            return (
              <div key={href}>
                <Link
                  href={isProdocEditor && prodocNavHref ? prodocNavHref : href}
                  className={cn(
                    // Top-level nav links mirror the admin nav below exactly —
                    // same type, icon size and gap — so the two sidebars read
                    // identically. Keep these in step if either side changes.
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-colors",
                    active
                      ? hasActiveNested ? NAV_PARENT_ACTIVE : NAV_ACTIVE
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>

                {showWikiSubs && (
                  <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2 border-l border-border/60">
                    {wikiSections.map((sub, i) => {
                      // Default the first item to active when no anchor is set yet.
                      const subActive =
                        wikiHash === sub.hash || (wikiHash === "" && i === 0);
                      return (
                        <Link
                          key={sub.hash}
                          href={`/partner/wiki#${sub.hash}`}
                          onClick={(e) => {
                            // Already on the guide: scroll smoothly ourselves.
                            // (App Router hash-only pushes don't fire hashchange,
                            // so we also update the URL + active state by hand.)
                            if (pathname === "/partner/wiki") {
                              e.preventDefault();
                              setWikiHash(sub.hash);
                              window.history.replaceState(null, "", `/partner/wiki#${sub.hash}`);
                              document
                                .getElementById(sub.hash)
                                ?.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                          className={cn(
                            "flex items-center rounded-md px-3 py-1.5 text-sm transition-colors",
                            subActive
                              ? `${NAV_ACTIVE} font-medium`
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {sub.number && (
                            <span className="mr-1.5 shrink-0 tabular-nums opacity-70">
                              {sub.number}
                            </span>
                          )}
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {showProdocs && (
                  <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                    {prodocItems.map((p) => {
                      const slug = projectSlug(p.project_short_name, p.project_title);
                      const pActive = openProdocSlug === slug;
                      return (
                        <div key={slug}>
                          <Link
                            href={`/partner/prodoc-editor/${slug}/${openProdocSection}`}
                            className={cn(
                              "flex flex-col rounded-md px-3 py-1.5 transition-colors",
                              pActive
                                ? NAV_PARENT_ACTIVE
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                            onClick={(e) => {
                              if (pActive) {
                                e.preventDefault();
                                setProdocSectionsCollapsed((v) => !v);
                              } else {
                                setProdocSectionsCollapsed(false);
                              }
                            }}
                          >
                            <span className="flex items-center gap-1">
                              <NameTip text={p.project_title}><span className="truncate text-sm font-medium">
                                {p.project_title}
                              </span></NameTip>
                              {pActive && (
                                prodocSectionsCollapsed
                                  ? <ChevronRight className="size-3 shrink-0" />
                                  : <ChevronDown className="size-3 shrink-0" />
                              )}
                            </span>
                          </Link>
                          {pActive && !prodocSectionsCollapsed &&
                            renderProdocSections("/partner/prodoc-editor", slug, openProdocSection, partnerProdocSections())}
                        </div>
                      );
                    })}
                  </div>
                )}

                {showReports && (() => {
                  // Level 1 = every report the partner can edit; level 2 = the
                  // sections of the report currently open (if any). Fall back to a
                  // synthetic entry from the URL until the report list loads.
                  const targetSection = report?.section ?? "overview";
                  // `id` keys the list: a project can hold an annual AND a final
                  // report in one year, so slug+year is not unique either.
                  const items: { id: number; slug: string; year: number; primary: string; secondary: string; isActive: boolean }[] =
                    (reports.length > 0
                      ? reports.map((r) => ({
                          id: r.id,
                          slug: reportSlug(r),
                          year: r.year,
                          primary: `${r.report_type ?? "annual"} Report ${r.year}`,
                          secondary: r.project_short_name || r.project_title,
                          isActive: !!report && reportSlug(r) === report.project && String(r.year) === report.year,
                        }))
                      // Synthetic placeholder from the URL while the list loads;
                      // it is the only row, so any stable key will do.
                      : report
                      ? [{ id: -1, slug: report.project, year: Number(report.year), primary: `Report ${report.year}`, secondary: report.project, isActive: true }]
                      : []);

                  if (items.length === 0) return null;

                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {items.map((it) => (
                        <div key={it.id}>
                          {/* Level 1: report — click to open (keeps the current section) */}
                          <Link
                            href={`/partner/report-editor/${it.slug}/${it.year}/${targetSection}`}
                            className={cn(
                              "flex flex-col rounded-md px-3 py-1.5 transition-colors",
                              it.isActive
                                ? NAV_PARENT_ACTIVE
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                            onClick={(e) => {
                              if (it.isActive) {
                                e.preventDefault();
                                setReportSectionsCollapsed((v) => !v);
                              } else {
                                setReportSectionsCollapsed(false);
                              }
                            }}
                          >
                            <span className="flex items-center gap-1">
                              <span className="truncate text-sm font-medium capitalize">{it.primary}</span>
                              {it.isActive && (
                                reportSectionsCollapsed
                                  ? <ChevronRight className="size-3 shrink-0" />
                                  : <ChevronDown className="size-3 shrink-0" />
                              )}
                            </span>
                            <NameTip text={it.secondary}><span className="truncate text-xs opacity-70">{it.secondary}</span></NameTip>
                          </Link>

                          {/* Level 2: sections of the open report, split into
                              Qualitative / Quantitative groups. */}
                          {it.isActive && report && !reportSectionsCollapsed &&
                            renderReportSections("/partner/report-editor", it.slug, it.year, report.section)}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {showUpdates && (() => {
                  const currentSection = openUpdate?.section;
                  // activeUpdateId is resolved once above (pinned by ?u=<id>) and
                  // reused here, so the highlight and the completion ticks can
                  // never disagree about which update is open.
                  const items = updates.map((u) => {
                    const slug = projectSlug(u.project_short_name, u.project_title);
                    const unlocked = u.unlocked_sections ?? [];
                    const isActive = u.id === activeUpdateId;
                    const sectionForLink =
                      currentSection && unlocked.includes(currentSection)
                        ? currentSection
                        : firstUnlockedSection(unlocked);
                    return { id: u.id, slug, year: u.year, primary: documentTitle(u), secondary: u.project_title, isActive, unlocked, sectionForLink };
                  });

                  if (items.length === 0) return null;

                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {items.map((it) => (
                        <div key={it.id}>
                          <Link
                            href={documentPath("/partner/project-updates", { id: it.id, data_type: "update", year: it.year }, it.slug, it.sectionForLink)}
                            className={cn(
                              "flex flex-col rounded-md px-3 py-1.5 transition-colors",
                              it.isActive
                                ? NAV_PARENT_ACTIVE
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                            onClick={(e) => {
                              if (it.isActive) {
                                e.preventDefault();
                                setUpdateSectionsCollapsed((v) => !v);
                              } else {
                                setUpdateSectionsCollapsed(false);
                              }
                            }}
                          >
                            <span className="flex items-center gap-1">
                              <span className="truncate text-sm font-medium">{it.primary}</span>
                              {it.isActive && (
                                updateSectionsCollapsed
                                  ? <ChevronRight className="size-3 shrink-0" />
                                  : <ChevronDown className="size-3 shrink-0" />
                              )}
                            </span>
                            <NameTip text={it.secondary}><span className="truncate text-xs opacity-70">{it.secondary}</span></NameTip>
                          </Link>

                          {it.isActive && openUpdate && !updateSectionsCollapsed &&
                            renderUpdateSections("/partner/project-updates", it, openUpdate.section)}
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
        <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1 px-3 py-4">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors mb-2",
              pathname === "/admin"
                ? NAV_ACTIVE
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Home className="size-4" />
            Home
          </Link>

          {adminNavGroups.map((group, gi) => (
          <div key={group.heading ?? "bottom"} className={cn(gi > 0 && "mt-8")}>
          {group.heading && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </p>
          )}
          {group.items.map((item) => {
            const ownActive = [item.href, ...(item.also ?? [])].some((h) => pathname.startsWith(h));
            // An open report puts "Project Reports" and the report's name in the
            // bold-no-fill state, so only the active section carries the fill.
            const reportOpen = item.href === "/admin/reports" && openAdminReport != null;
            // Same for the project document editor, listed under "Project Documents".
            const prodocOpen = item.href === "/admin/projects" && pathname.startsWith("/admin/prodoc-editor");
            // And for the project update editor, listed under "Project Updates".
            const updateOpen = item.href === "/admin/project-updates" && pathname.startsWith("/admin/project-update-editor");
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-colors",
                    reportOpen || prodocOpen || updateOpen
                      ? NAV_PARENT_ACTIVE
                      : ownActive
                      ? NAV_ACTIVE
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
                {reportOpen && openAdminReport && (() => {
                  // The open report: bold name (no fill) that toggles its section
                  // list; the active section carries the fill.
                  const openRow = (name: string) => (
                    <div>
                      <Link
                        href={`/admin/report-editor/${openAdminReport.project}/${openAdminReport.year}/${openAdminReport.section}`}
                        className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 transition-colors", NAV_PARENT_ACTIVE)}
                        onClick={(e) => {
                          e.preventDefault();
                          setReportSectionsCollapsed((v) => !v);
                        }}
                      >
                        <span className="truncate text-sm font-medium">{name}</span>
                        {reportSectionsCollapsed
                          ? <ChevronRight className="size-3 shrink-0" />
                          : <ChevronDown className="size-3 shrink-0" />}
                      </Link>
                      {!reportSectionsCollapsed &&
                        renderReportSections("/admin/report-editor", openAdminReport.project, openAdminReport.year, openAdminReport.section)}
                    </div>
                  );

                  // Report list not loaded yet: just the open report, named from the URL.
                  if (reports.length === 0) {
                    return (
                      <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                        {openRow(`Report ${openAdminReport.year}`)}
                      </div>
                    );
                  }

                  // All reports, grouped by project (A–Z), newest year first.
                  const byProject = new Map<number, { projectId: number; label: string; rows: SidebarReport[] }>();
                  for (const r of reports) {
                    const g = byProject.get(r.project_id) ?? { projectId: r.project_id, label: r.project_short_name || r.project_title, rows: [] };
                    g.rows.push(r);
                    byProject.set(r.project_id, g);
                  }
                  // Only the open report's project is shown; if the open report
                  // can't be matched to a project, fall back to every group.
                  const allGroups = Array.from(byProject.values()).sort((x, y) => x.label.localeCompare(y.label));
                  const groups = adminActiveReport
                    ? allGroups.filter((g) => g.projectId === adminActiveReport.project_id)
                    : allGroups;
                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {groups.map((g, gi) => (
                        <div key={g.label} className="flex flex-col gap-0.5">
                          <NameTip text={g.label}>
                            <p
                              className={cn(
                                "px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wider truncate",
                                gi > 0 && "mt-2 border-t border-crafd-grey-100 pt-3",
                                "text-crafd-grey-600"
                              )}
                            >
                              {g.label}
                            </p>
                          </NameTip>
                          {g.rows
                            .slice()
                            .sort((x, y) => y.year - x.year || x.id - y.id)
                            .map((r) =>
                              r.id === adminActiveReport?.id ? (
                                <div key={r.id}>{openRow(documentTitle(r))}</div>
                              ) : (
                                <Link
                                  key={r.id}
                                  href={`/admin/report-editor/${reportSlug(r)}/${r.year}/overview`}
                                  className="flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <span className="truncate">{documentTitle(r)}</span>
                                </Link>
                              )
                            )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {updateOpen && (() => {
                  // All updates grouped by project title (A–Z), newest year first.
                  // Only the open one is bold (no fill) and expands to the sections
                  // it unlocked.
                  const byProject = new Map<string, UpdateSidebarReport[]>();
                  for (const u of updates) {
                    const rows = byProject.get(u.project_title) ?? [];
                    rows.push(u);
                    byProject.set(u.project_title, rows);
                  }
                  // Only the open update's project is shown; if the open update
                  // can't be matched to a project, fall back to every group.
                  const allGroups = Array.from(byProject.entries()).sort((x, y) => x[0].localeCompare(y[0]));
                  const groups = adminActiveUpdate
                    ? allGroups.filter(([title]) => title === adminActiveUpdate.project_title)
                    : allGroups;
                  const linkFor = (u: UpdateSidebarReport) =>
                    documentPath(
                      "/admin/project-update-editor",
                      { id: u.id, data_type: "update", year: u.year },
                      projectSlug(u.project_short_name, u.project_title),
                      firstUnlockedSection(u.unlocked_sections ?? [])
                    );

                  // List not loaded yet: just the open update, named from the URL.
                  if (updates.length === 0) {
                    return openAdminUpdate ? (
                      <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                        <span className={cn("flex items-center rounded-md px-3 py-1.5 text-sm font-medium", NAV_PARENT_ACTIVE)}>
                          {`Project Update ${openAdminUpdate.year}`}
                        </span>
                      </div>
                    ) : null;
                  }
                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {groups.map(([title, rows], gi) => (
                        <div key={title} className="flex flex-col gap-0.5">
                          <NameTip text={title}>
                            <p
                              className={cn(
                                "px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wider truncate",
                                gi > 0 && "mt-2 border-t border-crafd-grey-100 pt-3",
                                "text-crafd-grey-600"
                              )}
                            >
                              {title}
                            </p>
                          </NameTip>
                          {rows
                            .slice()
                            .sort((x, y) => y.year - x.year || x.id - y.id)
                            .map((u) =>
                              u.id === adminActiveUpdate?.id && openAdminUpdate ? (
                                <div key={u.id}>
                                  <Link
                                    href={linkFor(u)}
                                    className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 transition-colors", NAV_PARENT_ACTIVE)}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setUpdateSectionsCollapsed((v) => !v);
                                    }}
                                  >
                                    <span className="truncate text-sm font-medium">{documentTitle(u)}</span>
                                    {updateSectionsCollapsed
                                      ? <ChevronRight className="size-3 shrink-0" />
                                      : <ChevronDown className="size-3 shrink-0" />}
                                  </Link>
                                  {!updateSectionsCollapsed &&
                                    renderUpdateSections(
                                      "/admin/project-update-editor",
                                      { id: u.id, year: u.year, slug: projectSlug(u.project_short_name, u.project_title), unlocked: u.unlocked_sections ?? [] },
                                      openAdminUpdate.section
                                    )}
                                </div>
                              ) : (
                                <Link
                                  key={u.id}
                                  href={linkFor(u)}
                                  onClick={() => setUpdateSectionsCollapsed(false)}
                                  className="flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <span className="truncate">{documentTitle(u)}</span>
                                </Link>
                              )
                            )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {prodocOpen && (() => {
                  // All project documents (one per project), A–Z by project title. Only the open one
                  // is bold (no fill) and expands to its tabs, admin-only ones included.
                  const label = (p: SidebarReport) => p.project_title;
                  // Only the open project document is shown; if it can't be matched
                  // to a project yet, fall back to the full list.
                  const sorted = prodocItems
                    .filter((p) => !openProdocRow || reportSlug(p) === openProdocSlug)
                    .sort((x, y) => label(x).localeCompare(label(y)));
                  const openTitle = (p: SidebarReport) => p.project_title;
                  return (
                    <div className="mt-1 mb-2 ml-4 flex flex-col gap-0.5 pl-2">
                      {sorted.map((p) => {
                        const slug = reportSlug(p);
                        return slug === openProdocSlug ? (
                          <div key={p.id}>
                            <Link
                              href={`/admin/prodoc-editor/${slug}/${openProdocSection}`}
                              className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 transition-colors", NAV_PARENT_ACTIVE)}
                              onClick={(e) => {
                                e.preventDefault();
                                setProdocSectionsCollapsed((v) => !v);
                              }}
                            >
                              <NameTip text={openTitle(p)}><span className="truncate text-sm font-medium">{label(p)}</span></NameTip>
                              {prodocSectionsCollapsed
                                ? <ChevronRight className="size-3 shrink-0" />
                                : <ChevronDown className="size-3 shrink-0" />}
                            </Link>
                            {!prodocSectionsCollapsed &&
                              renderProdocSections("/admin/prodoc-editor", slug, openProdocSection, PRODOC_SECTIONS.filter((s) => !s.hidden))}
                          </div>
                        ) : (
                          <Link
                            key={p.id}
                            href={`/admin/prodoc-editor/${slug}/general`}
                            className="flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <NameTip text={openTitle(p)}><span className="truncate">{label(p)}</span></NameTip>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
          </div>
          ))}
        </nav>
      )}

      <Separator />

      <div className="shrink-0 p-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          {mounted && user?.role === "partner" && user.organization && logoExt !== "none" ? (
            <img
              src={`/logos/${user.organization.toLowerCase()}.${logoExt}`}
              alt={shortName(user.organization)}
              className="size-9 shrink-0 rounded-full bg-white border object-contain p-1.5"
              onError={() => setLogoExt(logoExt === "webp" ? "png" : "none")}
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
              {mounted && user?.role ? (user.role === "admin" ? (shortName(user.organization) || "CRAF'd") : shortName(user.organization)) : ""}
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
