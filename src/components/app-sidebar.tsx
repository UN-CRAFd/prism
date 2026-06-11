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
  Bell,
  Building2,
  FolderKanban,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const dataLinks = [
  { href: "/admin", label: "Full Data", icon: Database },
];

const administrationLinks = [
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
  { href: "/admin/partners", label: "Partners", icon: Building2 },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
];


export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

      {!mounted ? (
        <nav className="flex-1 space-y-1 px-3 py-4" />
      ) : isPartner ? (
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {[
            { href: "/partner", label: "Home", icon: Home, exact: true },
            { href: "/partner/dashboard", label: "Reporting", icon: FileText, exact: false },
            { href: "/partner/notifications", label: "Notifications", icon: Bell, exact: false },
          ].map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                (exact ? pathname === href : pathname.startsWith(href))
                  ? "bg-crafd-yellow/10 text-crafd-yellow"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      ) : (
        <nav className="flex-1 space-y-1 px-3 py-4">
<p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          {administrationLinks.map((link) => {
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

          
          <div className="pt-2" />

          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data
          </p>
          {dataLinks.map((link) => {
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
              {mounted && user?.name ? user.name.charAt(0) : <User className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{mounted && user?.name ? user.name : ""}</p>
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
  );
}
