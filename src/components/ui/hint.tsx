"use client";

import * as React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import { cn } from "@/lib/utils";

/**
 * Hover hint using the app tooltip — use instead of the native `title` attribute.
 *
 *   <Hint label="Delete"><button aria-label="Delete">…</button></Hint>
 *
 * - Empty/undefined label → the child is rendered unchanged.
 * - `multiline` honours "\n" in the label.
 * - `disabled`: pass it when the child can be a disabled control. Disabled elements
 *   don't fire pointer events, so the child is wrapped in <span className="inline-flex">
 *   which receives the hover instead.
 * - The child must accept a ref and props (a DOM element or a forwardRef component).
 * - A tooltip does not name a control: icon-only buttons still need an aria-label.
 */
export function Hint({
  label,
  side,
  multiline,
  disabled,
  className,
  children,
}: {
  label?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactElement;
}) {
  if (label === undefined || label === null || label === false || label === "") return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side={side} className={cn(multiline && "whitespace-pre-line", className)}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
