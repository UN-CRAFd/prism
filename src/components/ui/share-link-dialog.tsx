"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2, Copy } from "lucide-react";

export function ShareLinkDialog({
  link,
  error,
  onClose,
}: {
  link: string;
  error: string | null;
  onClose: () => void;
}) {
  const [justCopied, setJustCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          {error ? (
            <>
              <p className="text-sm font-semibold text-destructive">Failed to create share link</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-semibold">Link copied</p>
              </div>
              <input
                readOnly
                value={link}
                className="w-full rounded border border-border bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The link directs the recipient to a password page — the first visit sets the
                partner&apos;s password; every subsequent visit requires that password to sign
                in as the partner organization. Links are valid for 90 days.
              </p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {!error && (
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
                {justCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {justCopied ? "Copied" : "Copy"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
