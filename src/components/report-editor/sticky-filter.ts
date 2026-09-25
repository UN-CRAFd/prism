"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Every report-section grid unmounts when the user moves to another tab, so a
// filter kept in plain component state resets on every switch. Mirroring the
// chosen set into sessionStorage keeps it for the life of the browser tab: the
// selection survives tab switches and reloads, but does not leak into the user's
// next visit the way localStorage would.

function readSet<T extends string | number>(storageKey: string): Set<T> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as T[]) : new Set();
  } catch {
    // Storage blocked (private mode) or a corrupt value — fall back to default.
    return new Set();
  }
}

function writeSet<T extends string | number>(storageKey: string, value: Set<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify([...value]));
  } catch {
    // Storage unavailable: the filter still works, it just stops persisting.
  }
}

/**
 * A Set of filter selections that outlives the component holding it. `storageKey`
 * identifies the grid, so each one keeps its own selection.
 */
export function useStickySet<T extends string | number>(
  storageKey: string
): [Set<T>, (updater: (prev: Set<T>) => Set<T>) => void] {
  const [value, setValue] = useState<Set<T>>(() => readSet<T>(storageKey));

  // A changed key means a different grid — load that one's stored selection
  // rather than carrying the previous one's over to it.
  const keyRef = useRef(storageKey);
  useEffect(() => {
    if (keyRef.current === storageKey) return;
    keyRef.current = storageKey;
    setValue(readSet<T>(storageKey));
  }, [storageKey]);

  // Written here rather than in an effect so that a key change can never flush
  // the outgoing grid's selection into the incoming grid's slot.
  const update = useCallback((updater: (prev: Set<T>) => Set<T>) => {
    setValue((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      writeSet(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [value, update];
}
