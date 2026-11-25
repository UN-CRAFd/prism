"use client";

import * as React from "react";
import { Textarea } from "./textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import { cn } from "@/lib/utils";

// Watches whether `el`'s content is taller than its box (re-measured on text change
// and on resize, e.g. when a column is resized).
function useOverflowing<T extends HTMLElement>(ref: React.RefObject<T | null>, deps: unknown[]) {
  const [overflowing, setOverflowing] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return overflowing;
}

const FULL_TEXT = "max-w-md whitespace-pre-wrap [overflow-wrap:anywhere]";

/**
 * Table-cell textarea that stays a fixed small height. When its text doesn't fit,
 * hovering shows the full text in the app tooltip. While focused it grows to fit
 * (capped, like the base Textarea) so the text can be edited, and collapses again
 * on blur.
 */
export function CollapsedTextarea({
  className,
  onFocus,
  onBlur,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value"> & { value: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const overflowing = useOverflowing(ref, [props.value, focused]);
  const open = hovered && !focused && overflowing && props.value.trim() !== "";

  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <div onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
          <Textarea
            ref={ref}
            {...props}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            className={cn(
              "resize-none w-full",
              className,
              !focused && "field-sizing-fixed h-[60px] min-h-[60px] max-h-[60px] overflow-hidden",
            )}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={FULL_TEXT}>{props.value}</TooltipContent>
    </Tooltip>
  );
}

/** Read-only counterpart: text clamped to `lines`, full text on hover when cut off. */
export function CollapsedText({ text, lines = 3, className }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = React.useState(false);
  const overflowing = useOverflowing(ref, [text]);
  const clamp = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" }[lines];
  return (
    <Tooltip open={hovered && overflowing}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          className={cn(clamp, className)}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={FULL_TEXT}>{text}</TooltipContent>
    </Tooltip>
  );
}
