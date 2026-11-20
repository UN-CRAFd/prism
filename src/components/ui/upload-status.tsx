"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";

// "Upload successful" feedback for every file upload. The app has no toast system;
// its message pattern is the inline <Notice>, so this is a Notice (green) that
// clears itself after a few seconds. Failures keep going through each uploader's
// existing inline error message.
export function useUploadSuccess(ms = 4000) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setShown(false);
  }, []);
  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShown(true);
    timer.current = setTimeout(() => setShown(false), ms);
  }, [ms]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { shown, flash, clear };
}

/** `compact` = a one-line green note for tight spots (photo cells, editor footers);
 *  otherwise the full success Notice. */
export function UploadSuccess({ show, compact, className }: { show: boolean; compact?: boolean; className?: string }) {
  if (!show) return null;
  if (compact) {
    return (
      <p role="status" className={cn("inline-flex items-center gap-1 text-xs font-medium text-green-700", className)}>
        <CircleCheck className="size-3.5" />{labels.common.uploadSuccess}
      </p>
    );
  }
  return (
    <Notice variant="success" icon={<CircleCheck />} className={className}>
      <span role="status">{labels.common.uploadSuccess}</span>
    </Notice>
  );
}
