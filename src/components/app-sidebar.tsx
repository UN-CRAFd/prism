"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  BarChart3,
  GitCompareArrows,
  Database,
  LogOut,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const partnerLinks = [
  {
    href: "/partner/survey",
    label: "Survey",
    icon: ClipboardList,
  },
];

const adminLinks = [
  {
    href: "/admin",
    label: "Full Data",
    icon: Database,
  },
  {
    href: "/admin/visualization",
    label: "Visualization",
    icon: BarChart3,
  },
  {
    href: "/admin/comparison",
    label: "Comparison",
    icon: GitCompareArrows,
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const links = user?.role === "admin" ? adminLinks : partnerLinks;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
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

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {user?.role === "admin" ? "Administration" : "Reporting"}
        </p>
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/admin" && pathname.startsWith(link.href));
          const isAdminExact =
            link.href === "/admin" && pathname === "/admin";
          const active = link.href === "/admin" ? isAdminExact : isActive;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
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
