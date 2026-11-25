"use client";

import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { wordCount } from "@/lib/word-count";
import { useWordLimits } from "@/lib/use-word-limits";

// The "{used}/{max} words" counter shown under a limited field, right-aligned. Over the
// limit it turns red and adds the hint. Text over the limit still saves (except the
// Testimonials rows, which hold back saving). `limitKey` is a key of lib/limits.ts.
export function WordCounter({
  value,
  limitKey,
  overNote,
  className,
}: {
  value: string | null | undefined;
  limitKey: string;
  /** Extra text after the hint when over the limit (e.g. "Won't save until shortened."). */
  overNote?: string;
  className?: string;
}) {
  const { limit } = useWordLimits();
  const max = limit(limitKey);
  const used = wordCount(value);
  const over = used > max;
  return (
    <div className={cn("text-right select-none", className)}>
      <p className={cn("text-xs tabular-nums", over ? "text-destructive font-medium" : "text-muted-foreground")}>
        {used.toLocaleString()}/{max.toLocaleString()} words
      </p>
      {over && <p className="text-xs text-destructive">{labels.common.overLimitHint}{overNote ? ` ${overNote}` : ""}</p>}
    </div>
  );
}
