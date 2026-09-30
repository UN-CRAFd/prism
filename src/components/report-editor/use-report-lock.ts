"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEditorSessionId } from "@/lib/editor-session-id";
import { REPORT_LOCK_TIMEOUT_MS, REPORT_LOCK_WARNING_MS } from "@/lib/editor-lock";

export type LockPhase = "idle" | "acquiring" | "held" | "warning" | "timed-out" | "blocked" | "available" | "lock-error";

function releaseLock(reportId: number) {
  return fetch("/api/report-lock", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, session_id: getEditorSessionId() }),
    keepalive: true,
  }).catch(() => {});
}

export function useReportLock({ reportId, enabled }: { reportId: number | null; enabled: boolean }) {
  const [phase, setPhase] = useState<LockPhase>("idle");
  const [holder, setHolder] = useState<{ name: string; role: string } | null>(null);

  const phaseRef = useRef<LockPhase>("idle");
  phaseRef.current = phase;

  const reportIdRef = useRef<number | null>(reportId);
  reportIdRef.current = reportId;

  const lastEditRef = useRef<number>(0);

  // Send a DELETE on page close/refresh. The acquire-effect cleanup covers
  // navigation within the app; this covers true browser unloads.
  useEffect(() => {
    function handleBeforeUnload() {
      const id = reportIdRef.current;
      const p = phaseRef.current;
      if (id != null && (p === "held" || p === "warning")) releaseLock(id);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Acquire the lock when enabled and reportId is set; release on change or unmount.
  // Uses AbortController so a stale response from a previous report never updates
  // state after the effect has been cleaned up.
  useEffect(() => {
    if (!enabled || reportId == null) {
      setPhase("idle"); phaseRef.current = "idle";
      return;
    }
    const controller = new AbortController();
    setPhase("acquiring"); phaseRef.current = "acquiring";

    (async () => {
      try {
        const res = await fetch("/api/report-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, session_id: getEditorSessionId() }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          setPhase("held"); phaseRef.current = "held";
          lastEditRef.current = Date.now();
        } else if (res.status === 409) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          setPhase("blocked"); phaseRef.current = "blocked";
          setHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
        } else {
          setPhase("lock-error"); phaseRef.current = "lock-error";
        }
      } catch {
        if (!controller.signal.aborted) {
          setPhase("lock-error"); phaseRef.current = "lock-error";
        }
      }
    })();

    return () => {
      controller.abort();
      const p = phaseRef.current;
      if (p === "held" || p === "warning") releaseLock(reportId);
      setPhase("idle"); phaseRef.current = "idle";
      setHolder(null);
    };
  }, [reportId, enabled]);

  // Tick every 10 s to evaluate inactivity warning/timeout with fine enough
  // granularity that the warning cannot be skipped. Heartbeat POST sent at most
  // once per 60 s (when tab visible) so the server sees the same rate as before.
  const isHolding = phase === "held" || phase === "warning";
  useEffect(() => {
    if (!isHolding || reportId == null) return;

    async function verifyOwnership() {
      const p = phaseRef.current;
      if (p !== "held" && p !== "warning") return;
      const id = reportIdRef.current;
      if (id == null) return;
      try {
        const sid = encodeURIComponent(getEditorSessionId());
        const r = await fetch(`/api/report-lock?report_id=${id}&session_id=${sid}`);
        if (!r.ok) {
          setPhase("lock-error"); phaseRef.current = "lock-error";
          return;
        }
        const data = await r.json();
        if (data.held && !data.byMe) {
          setPhase("blocked"); phaseRef.current = "blocked";
          setHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
        } else if (!data.held) {
          // Lock lapsed while we were away. Only re-acquire if the inactivity
          // limit hasn't been reached — time on another tab counts against it.
          if (Date.now() - lastEditRef.current >= REPORT_LOCK_TIMEOUT_MS) {
            setPhase("timed-out"); phaseRef.current = "timed-out";
            return;
          }
          try {
            const reacquire = await fetch("/api/report-lock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ report_id: id, session_id: getEditorSessionId() }),
            });
            if (reacquire.ok) {
              setPhase("held"); phaseRef.current = "held";
              lastEditRef.current = Date.now();
            } else if (reacquire.status === 409) {
              const taken = await reacquire.json();
              setPhase("blocked"); phaseRef.current = "blocked";
              setHolder({ name: taken.holder_name ?? "?", role: taken.holder_role ?? "?" });
            } else {
              setPhase("lock-error"); phaseRef.current = "lock-error";
            }
          } catch {
            setPhase("lock-error"); phaseRef.current = "lock-error";
          }
        }
      } catch {
        setPhase("lock-error"); phaseRef.current = "lock-error";
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") verifyOwnership();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let lastHeartbeat = Date.now();

    const interval = setInterval(async () => {
      const p = phaseRef.current;
      if (p !== "held" && p !== "warning") return;
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      const timeSinceEdit = now - lastEditRef.current;
      const id = reportIdRef.current;

      if (timeSinceEdit >= REPORT_LOCK_TIMEOUT_MS) {
        if (id != null) await releaseLock(id);
        setPhase("timed-out"); phaseRef.current = "timed-out";
        return;
      }

      if (timeSinceEdit >= REPORT_LOCK_WARNING_MS && p === "held") {
        setPhase("warning"); phaseRef.current = "warning";
      }

      if (id == null) return;

      if (now - lastHeartbeat >= 60_000) {
        lastHeartbeat = now;
        try {
          const r = await fetch("/api/report-lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_id: id, session_id: getEditorSessionId() }),
          });
          if (r.status === 409) {
            const data = await r.json();
            setPhase("blocked"); phaseRef.current = "blocked";
            setHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
          } else if (!r.ok) {
            setPhase("lock-error"); phaseRef.current = "lock-error";
          }
        } catch {
          setPhase("lock-error"); phaseRef.current = "lock-error";
        }
      }
    }, 10_000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHolding, reportId]);

  // Poll GET every 15 s while blocked; transition to "available" when the lock frees.
  useEffect(() => {
    if (phase !== "blocked" || reportId == null) return;
    const poll = setInterval(async () => {
      try {
        const id = reportIdRef.current;
        if (id == null) return;
        const sid = encodeURIComponent(getEditorSessionId());
        const res = await fetch(`/api/report-lock?report_id=${id}&session_id=${sid}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.held) {
          setPhase("available"); phaseRef.current = "available";
        } else {
          setHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
        }
      } catch { /* network error during poll — ignore */ }
    }, 15_000);
    return () => clearInterval(poll);
  }, [phase, reportId]);

  const noteEdit = useCallback(() => {
    lastEditRef.current = Date.now();
    if (phaseRef.current === "warning") {
      setPhase("held"); phaseRef.current = "held";
    }
  }, []);

  const startEditing = useCallback(async () => {
    const id = reportIdRef.current;
    if (id == null) return;
    setPhase("acquiring"); phaseRef.current = "acquiring";
    const res = await fetch("/api/report-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: id, session_id: getEditorSessionId() }),
    });
    if (res.ok) {
      setPhase("held"); phaseRef.current = "held";
      lastEditRef.current = Date.now();
      setHolder(null);
    } else if (res.status === 409) {
      const data = await res.json();
      setPhase("blocked"); phaseRef.current = "blocked";
      setHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
    } else {
      setPhase("lock-error"); phaseRef.current = "lock-error";
    }
  }, []);

  const isReadOnlyByLock =
    phase === "blocked" || phase === "timed-out" || phase === "available" || phase === "acquiring" || phase === "lock-error";

  return { phase, holder, noteEdit, startEditing, isReadOnlyByLock };
}
