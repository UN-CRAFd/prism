"use client";

import { useEffect } from "react";

// Route-level error boundary for everything under the root layout. Unlike
// `global-error.tsx` this renders inside the existing layout (nav, fonts, etc.),
// so a failure in one page degrades to a recoverable panel rather than tearing
// down the whole app.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        message: "Unhandled route error",
        error: { name: error.name, message: error.message, digest: error.digest },
      })
    );
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page hit an unexpected error. You can try again, and if it keeps
        happening please contact the CRAF&apos;d team.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
