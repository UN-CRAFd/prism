"use client";

import { useEffect, useState } from "react";
import { DESCRIPTION_MAX_CHARS, narrativeLimit } from "@/lib/limits";

interface StoredLimits {
  description: number;
  narratives: Record<string, number>;
}

// Module-level promise — fetched once per browser session, shared across all
// component mounts. Resets on full page reload.
let limitsPromise: Promise<StoredLimits> | null = null;

function fetchLimits(): Promise<StoredLimits> {
  if (!limitsPromise) {
    limitsPromise = fetch("/api/admin/settings/char-limits")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => ({
        description:
          typeof data?.limits?.description === "number"
            ? data.limits.description
            : DESCRIPTION_MAX_CHARS,
        narratives:
          data?.limits?.narratives && typeof data.limits.narratives === "object"
            ? (data.limits.narratives as Record<string, number>)
            : {},
      }))
      .catch(() => ({
        description: DESCRIPTION_MAX_CHARS,
        narratives: {} as Record<string, number>,
      }));
  }
  return limitsPromise;
}

export interface CharLimits {
  description: number;
  narrativeLimit: (key: string) => number;
  loaded: boolean;
}

/** Fetches character limits from the server once and caches them for the session.
 *  Returns hardcoded defaults synchronously while loading. */
export function useCharLimits(): CharLimits {
  const [stored, setStored] = useState<StoredLimits | null>(null);

  useEffect(() => {
    fetchLimits().then(setStored);
  }, []);

  if (!stored) {
    return { description: DESCRIPTION_MAX_CHARS, narrativeLimit, loaded: false };
  }

  return {
    description: stored.description,
    narrativeLimit: (key: string) => stored.narratives[key] ?? narrativeLimit(key),
    loaded: true,
  };
}
