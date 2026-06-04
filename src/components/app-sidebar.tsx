"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  GitCompareArrows,
  Database,
  LogOut,
  User,
  PenLine,
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Trophy,
  Lightbulb,
  Megaphone,
  TrendingUp,
  DollarSign,
  CalendarCheck,
  ShieldAlert,
  ArrowRightLeft,
  HandCoins,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NARRATIVE_TABS, QUANTITATIVE_TABS } from "@/lib/survey-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const adminLinks = [
  { href: "/admin", label: "Full Data", icon: Database },
  { href: "/admin/visualization", label: "Visualization", icon: BarChart3 },
  { href: "/admin/comparison", label: "Comparison", icon: GitCompareArrows },
  { href: "/admin/survey-editor", label: "Survey Editor", icon: PenLine },
];

const narrativeIcons: Record<string, React.ElementType> = {
  "project-info": FileText,
  "self-assessment": ClipboardCheck,
  achievements: Trophy,
  lessons: Lightbulb,
  visibility: Megaphone,
};

const quantitativeIcons: Record<string, React.ElementType> = {
  indicators: TrendingUp,
  expenditures: DollarSign,
  "work-plan": CalendarCheck,
  risk: ShieldAlert,
  "funding-transfer": ArrowRightLeft,
  complementary: HandCoins,
};

export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "project-info";

  const isPartner = user?.role === "partner";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar shrink-0">
      <div className="flex items-center gap-3 px-6 py-5">
        <Image
          src="/images/crafd-logo-full-black.svg"
          alt="CRAF'd"
          width={140}
          height={92}
          priority
        />
      </div>

      <Separator />

      {isPartner ? (
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <Link
            href="/partner/dashboard"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mb-2",
              pathname === "/partner/dashboard"
                ? "bg-crafd-yellow/10 text-crafd-yellow"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LayoutDashboard className="size-3.5 shrink-0" />
            Dashboard
          </Link>
          <Separator className="my-2" />
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-crafd-yellow">
            Narrative Report
          </p>
          {NARRATIVE_TABS.map((tab) => {
            const Icon = narrativeIcons[tab.id] || FileText;
            const isActive = pathname === "/partner/survey" && activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/partner/survey?tab=${tab.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-crafd-yellow/10 text-crafd-yellow"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                {tab.label}
              </Link>
            );
          })}

          <div className="pt-3" />
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-blue-500">
            Quantitative Report
          </p>
          {QUANTITATIVE_TABS.map((tab) => {
            const Icon = quantitativeIcons[tab.id] || TrendingUp;
            const isActive = pathname === "/partner/survey" && activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/partner/survey?tab=${tab.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-blue-500/10 text-blue-600"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : (
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          {adminLinks.map((link) => {
            const isActive =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
          <Avatar className="size-9">
            <AvatarFallback className="bg-crafd-yellow text-black text-xs font-bold">
              {user?.name?.charAt(0) || <User className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {user?.role}
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
  );
}
