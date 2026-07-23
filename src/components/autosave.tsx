"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";

export type SaveState = "idle" | "saving" | "saved" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Shared debounced-autosave controller + status indicator used by every partner
// and admin editor. `flush` performs the actual save (only the dirty items);
// call `schedule()` on each edit and `flushNow()` to force a save (e.g. unmount).
//
// The latest `flush`/`onStateChange` closures are tracked in refs so the debounce
// timer always runs against current state without re-subscribing.
// ─────────────────────────────────────────────────────────────────────────────

export function useAutosave(
  flush: () => Promise<void>,
  opts?: { delay?: number; onStateChange?: (s: SaveState) => void }
) {
  const delay = opts?.delay ?? 700;

  const [state, setState] = useState<SaveState>("idle");

  const flushRef = useRef(flush);
  flushRef.current = flush;
  const onStateChangeRef = useRef(opts?.onStateChange);
  onStateChangeRef.current = opts?.onStateChange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const runRef = useRef<() => void>(() => {});
  const scheduleRef = useRef<() => void>(() => {});

  const emit = useCallback((s: SaveState) => {
    setState(s);
    onStateChangeRef.current?.(s);
  }, []);

  const run = useCallback(async () => {
    // A save is already in flight — mark that another pass is needed and bail.
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    emit("saving");
    try {
      await flushRef.current();
      emit("saved");
    } catch {
      emit("error");
    } finally {
      savingRef.current = false;
      // Re-run if edits landed mid-save so nothing is left unsaved.
      if (pendingRef.current) { pendingRef.current = false; scheduleRef.current(); }
    }
  }, [emit]);
  runRef.current = run;

  const schedule = useCallback(() => {
    emit("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runRef.current(), delay);
  }, [delay, emit]);
  scheduleRef.current = schedule;

  // Force any pending edit to save immediately (used on unmount).
  const flushNow = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    runRef.current();
  }, []);

  return { state, schedule, flushNow };
}

export function AutosaveIndicator({
  state,
  tone = "light",
  idleAsSaved = false,
}: {
  state: SaveState;
  tone?: "light" | "dark";
  idleAsSaved?: boolean;
}) {
  const s = idleAsSaved && state === "idle" ? "saved" : state;
  if (s === "idle") return null;
  if (s === "saving") {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm", tone === "dark" ? "text-neutral-300" : "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin" /> {labels.common.saving}
      </span>
    );
  }
  if (s === "saved") {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm", tone === "dark" ? "text-green-400" : "text-green-600")}>
        <CheckCircle2 className="size-4" /> All changes saved
      </span>
    );
  }
  return (
    <span className={cn("text-sm", tone === "dark" ? "text-red-300" : "text-destructive")}>
      Save failed — retrying on next change
    </span>
  );
}
