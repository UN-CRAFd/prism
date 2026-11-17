import { cn } from "@/lib/utils";

// Asterisk (CRAF'd brand yellow; pass className="text-crafd-yellow-900" on
// yellow-tinted backgrounds) shown after the label of every mandatory question / field / column —
// one that the section's completion check (/api/prodoc-completion,
// /api/report-completion) or the submit route requires. Rendered in JSX rather
// than baked into labels.json so admin label overrides can't drop it.
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("ml-0.5 font-bold text-crafd-yellow", className)}>
      *
    </span>
  );
}
