"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// `field-sizing-content` grows the box to fit its text. We keep the vertical
// grow but cap it at max-h-[120px] (scrolls internally beyond that), and lock
// the horizontal axis so typing never widens the box: full width of the
// container, and long lines wrap onto a new line (break-words handles unbroken
// strings) instead of extending sideways.
//
// Once the user grabs the resize handle (detected on mousedown by checking
// whether the click lands in the bottom-right 16×16px corner of the element),
// field-sizing-content and the default max-h cap are both dropped immediately
// — before the drag — so the browser can honour the drag that follows. At that
// same moment we snapshot the current offsetHeight into inline style.height so
// the box doesn't jump to a different size when the class is removed.
// After a resize the user's chosen height governs and field-sizing no longer
// applies. The state is per-instance and does not reset when the value changes.

const BASE =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-16 w-full max-w-full rounded-md border bg-transparent px-3 py-2 text-base whitespace-pre-wrap [overflow-wrap:anywhere] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
const AUTO_CLASSES = "field-sizing-content max-h-[120px] overflow-y-auto";
const INVALID = "aria-invalid:ring-destructive/20 aria-invalid:border-destructive";

const HANDLE_SIZE = 16;

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function Textarea({ className, onMouseDown, onMouseUp, ...props }, ref) {
  const [resized, setResized] = React.useState(false);
  const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    },
    [ref]
  );

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const el = internalRef.current;
      if (!resized && el) {
        const rect = el.getBoundingClientRect();
        const inHandle =
          e.clientX >= rect.right - HANDLE_SIZE &&
          e.clientY >= rect.bottom - HANDLE_SIZE;
        if (inHandle) {
          el.style.height = `${el.offsetHeight}px`;
          setResized(true);
        }
      }
      onMouseDown?.(e);
    },
    [resized, onMouseDown]
  );

  const handleMouseUp = React.useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      onMouseUp?.(e);
    },
    [onMouseUp]
  );

  return (
    <textarea
      ref={setRefs}
      data-slot="textarea"
      className={cn(BASE, !resized && AUTO_CLASSES, INVALID, className)}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      {...props}
    />
  );
});

export { Textarea };
