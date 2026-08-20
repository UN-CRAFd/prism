"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export function InfoPopover({
  description,
  meansOfVerification,
}: {
  description?: string | null;
  meansOfVerification?: string | null;
}) {
  const hasContent = !!(description || meansOfVerification);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const margin = 8;

    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;

    let top: number;
    if (spaceBelow >= panelHeight + margin) {
      top = r.bottom + 4;
    } else if (spaceAbove >= panelHeight + margin) {
      top = r.top - panelHeight - 4;
    } else {
      // Fits neither direction cleanly — pick whichever side has more room and clamp.
      if (spaceBelow >= spaceAbove) {
        top = Math.min(r.bottom + 4, window.innerHeight - panelHeight - margin);
      } else {
        top = Math.max(r.top - panelHeight - 4, margin);
      }
    }
    // Final clamp: never above the top of the viewport.
    top = Math.max(top, margin);

    const right = Math.max(margin, window.innerWidth - r.right);
    setPos({ top, right });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    // Panel is already in the DOM (rendered hidden below), so offsetHeight is readable.
    reposition();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, reposition]);

  if (!hasContent) return null;

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="Indicator details"
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <Info className="size-4 mt-0.5" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop only shown once positioned; panel is rendered hidden first for measurement. */}
          {pos && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
          <div
            ref={panelRef}
            className="fixed z-50 w-72 rounded-lg border bg-popover shadow-lg text-popover-foreground p-3 space-y-3"
            style={pos
              ? { top: pos.top, right: pos.right }
              : { top: -9999, right: -9999, visibility: "hidden" }}
          >
            {description && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">What it measures</p>
                <p className="text-sm leading-snug">{description}</p>
              </div>
            )}
            {meansOfVerification && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">How it&apos;s verified</p>
                <p className="text-sm leading-snug">{meansOfVerification}</p>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </span>
  );
}
