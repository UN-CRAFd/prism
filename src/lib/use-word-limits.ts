"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_WORD_LIMIT, defaultWordLimit } from "@/lib/limits";

// Word limits for the editors. Fetched once per browser session and shared by every
// mount (reset on a full page reload, or by invalidateWordLimits() after Settings saves).
// Until loaded — or if the fetch fails — the registry defaults apply.

let overridesPromise: Promise<Record<string, number>> | null = null;

function fetchOverrides(): Promise<Record<string, number>> {
  if (!overridesPromise) {
    overridesPromise = fetch("/api/admin/settings/word-limits")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => (data?.overrides && typeof data.overrides === "object" ? (data.overrides as Record<string, number>) : {}))
      .catch(() => ({} as Record<string, number>));
  }
  return overridesPromise;
}

export function invalidateWordLimits() {
  overridesPromise = null;
}

export interface UseWordLimits {
  limit: (key: string) => number;
  loaded: boolean;
}

export function useWordLimits(): UseWordLimits {
  const [overrides, setOverrides] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOverrides().then((o) => { if (!cancelled) setOverrides(o); });
    return () => { cancelled = true; };
  }, []);
  // Stable between renders (only changes when the overrides load), so it is safe in
  // hook dependency arrays.
  return useMemo(
    () => ({
      loaded: overrides !== null,
      limit: (key: string) => overrides?.[key] ?? defaultWordLimit(key) ?? MAX_WORD_LIMIT,
    }),
    [overrides]
  );
}
