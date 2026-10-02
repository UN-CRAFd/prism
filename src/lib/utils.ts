import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The one definition of the URL slug form for project names.
export function projectSlug(shortName: string | null | undefined, title: string): string {
  const base = (shortName != null && shortName.trim() !== "" ? shortName : title);
  const slug = base
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "project";
}

// Partner/project short names are always DISPLAYED in uppercase (e.g. "IDMC",
// "ACLED"), regardless of how they're stored. Null-safe: returns "" for a
// missing value so callers can `shortName(x) || fallback`. Use only for display
// — never for slugs, comparisons, or query params (those stay lowercase).
export function shortName(value: string | null | undefined): string {
  return value ? value.toUpperCase() : "";
}

export function formatDate(date: string | Date): string {
  // Plain YYYY-MM-DD: parse directly from the string to avoid UTC→local shifts.
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
  }
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatAmount(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatUsd(v: number | string | null | undefined): string {
  const a = formatAmount(v);
  if (a === "—") return "—";
  const n = Number(v);
  if (n < 0) return "-$" + a.slice(1);
  return "$" + a;
}

// Compact relative time ("just now", "5m ago", "3h ago", "2d ago"), falling back
// to a date for anything older than a week. Client-only (reads the current time).
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}
