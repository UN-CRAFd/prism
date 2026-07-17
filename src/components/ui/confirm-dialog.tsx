"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
}

type Resolver = (confirmed: boolean) => void;

interface DialogState {
  options: ConfirmOptions;
  resolve: Resolver;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

// ── Provider (mount once near the root) ──────────────────────────────────────

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialog({ options: opts, resolve });
    });
  }, []);

  function handleConfirm() {
    resolverRef.current?.(true);
    setDialog(null);
  }

  function handleCancel() {
    resolverRef.current?.(false);
    setDialog(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && typeof window !== "undefined" &&
        createPortal(
          <ConfirmDialogUI
            options={dialog.options}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmDialogProvider>");
  return ctx;
}

// ── Dialog UI ─────────────────────────────────────────────────────────────────

function ConfirmDialogUI({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    title,
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    variant = "destructive",
  } = options;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-3 mb-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                variant === "destructive"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {variant === "destructive" ? (
                <Trash2 className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </span>
            <div>
              {title && (
                <p className="text-sm font-semibold text-foreground leading-snug mb-1">{title}</p>
              )}
              <p className="text-sm text-muted-foreground leading-snug">{message}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
