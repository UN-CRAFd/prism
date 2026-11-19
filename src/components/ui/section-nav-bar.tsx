import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// The Back / Next bar shared by the report, project update and project document
// editors. It is the LAST child of the editor's full-height flex column, after the
// scrolling content area — so it stays at the bottom of the screen, spans only the
// content area (never the sidebar, and it follows the sidebar when that collapses),
// and can never cover the last row or the Add buttons (the content scrolls above it).
//
// Back is the neutral grey button, Next the light orange "nav" one. On the last
// section `children` replaces Next (the Submit control and its blocker message).
export function SectionNavBar({
  back,
  next,
  children,
}: {
  back?: { label: string; onClick: () => void } | null;
  next?: { label: string; onClick: () => void } | null;
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-crafd-grey-100 bg-white px-8 py-3 flex items-center justify-between gap-4">
      {back ? (
        <Button variant="secondary" className="border border-crafd-grey-200" onClick={back.onClick}>
          <ChevronLeft className="size-4" /> Back: {back.label}
        </Button>
      ) : <div />}
      {next ? (
        <Button variant="nav" onClick={next.onClick}>
          Next: {next.label}
          <ChevronRight className="size-4" />
        </Button>
      ) : children ?? null}
    </div>
  );
}
