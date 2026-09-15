"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CLAMP_CLASS: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

interface ClampedTextProps {
  text: string;
  className?: string;
  lines?: number;
}

export function ClampedText({ text, className, lines = 3 }: ClampedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const pRef = useRef<HTMLParagraphElement>(null);

  // Collapse whenever text is replaced so fresh content starts measured.
  useEffect(() => { setExpanded(false); }, [text]);

  // Measure while collapsed; ResizeObserver keeps it correct on column resize.
  useLayoutEffect(() => {
    const el = pRef.current;
    if (!el) return;
    const check = () => {
      if (!expanded) setIsTruncated(el.scrollHeight > el.clientHeight);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div>
      <p ref={pRef} className={cn(className, !expanded && (CLAMP_CLASS[lines] ?? CLAMP_CLASS[3]))}>
        {text}
      </p>
      {isTruncated && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
