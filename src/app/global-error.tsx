"use client";

import { useEffect } from "react";

// Top-level error boundary. This catches render/runtime errors thrown in the
// root layout itself (where `error.tsx` cannot reach) and replaces the whole
// document — so a single unhandled exception shows a recoverable screen instead
// of a blank white page. It must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console (and any wired error tracker) with the
    // Next.js `digest` so a client report can be tied to a server log line.
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        message: "Unhandled application error (global)",
        error: { name: error.name, message: error.message, digest: error.digest },
      })
    );
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.6rem 1.4rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
