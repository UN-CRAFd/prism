import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // `field-sizing-content` grows the box to fit its text. We keep the
        // vertical grow but lock the horizontal axis so typing never widens the
        // box: full width of the container, and long lines wrap onto a new line
        // (break-words handles unbroken strings) instead of extending sideways.
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex field-sizing-content min-h-16 w-full max-w-full rounded-md border bg-transparent px-3 py-2 text-base whitespace-pre-wrap [overflow-wrap:anywhere] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
