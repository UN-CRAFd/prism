"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";

export interface StatusChangeValues {
  actorName: string;
  reason: string;
}

export interface StatusChangeDialogProps {
  open: boolean;
  fromStatus: string;
  toStatus: string;
  onCancel: () => void;
  onConfirm: (values: StatusChangeValues) => void;
}

function StatusChangeDialogUI({
  fromStatus,
  toStatus,
  onCancel,
  onConfirm,
}: Omit<StatusChangeDialogProps, "open">) {
  const [actorName, setActorName] = useState("");
  const [reason, setReason] = useState("");

  // Reset fields each time the dialog mounts (open → true triggers a remount
  // via the parent's conditional render).
  useEffect(() => {
    setActorName("");
    setReason("");
  }, []);

  function handleConfirm() {
    onConfirm({ actorName: actorName.trim(), reason: reason.trim() });
  }

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
        <div className="p-6 space-y-4">
          {/* Icon + title */}
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <RefreshCw className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground leading-snug mb-1">Change status?</p>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>{fromStatus}</span>
                <ArrowRight className="size-3.5 shrink-0" />
                <span>{toStatus}</span>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Your name</label>
              <Input
                value={actorName}
                onChange={(e) => setActorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") onCancel(); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Reason</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this status changing?"
                className="min-h-[80px] resize-y"
                onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

export function StatusChangeDialog({ open, fromStatus, toStatus, onCancel, onConfirm }: StatusChangeDialogProps) {
  if (!open || typeof window === "undefined") return null;
  return createPortal(
    <StatusChangeDialogUI
      fromStatus={fromStatus}
      toStatus={toStatus}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
    document.body
  );
}
