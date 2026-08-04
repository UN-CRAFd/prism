// ─────────────────────────────────────────────────────────────────────────────
// Minimal structured logger.
//
// The codebase previously logged with bare `console.error("...", err)` calls
// scattered across the route handlers. That is hard to search, carries no
// severity/context, and gives nowhere to plug in an error-tracking service.
//
// This module is the single choke point for diagnostics. It emits one JSON line
// per event (timestamp, level, message, context, serialized error) which any log
// collector (Azure Log Stream, Datadog, etc.) can parse, and exposes a
// `reportError` hook where a service like Sentry can be wired in later WITHOUT
// touching the 30+ call sites again — see the TODO below.
//
// Usage:
//   import { logger } from "@/lib/logger";
//   logger.error("PUT /api/projects/[id] failed", err, { projectId: id });
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

function serializeError(err: unknown): LogContext | undefined {
  if (err === undefined) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stacks are useful in logs but never surface to the client — the route
      // handlers already return generic messages.
      stack: err.stack,
    };
  }
  return { value: String(err) };
}

/**
 * Hook for an external error-tracking service. Wire Sentry (or similar) in here
 * once — every `logger.error` call already flows through it.
 *
 *   // reportError = (err, ctx) => Sentry.captureException(err, { extra: ctx });
 */
let reportError: ((err: unknown, context?: LogContext) => void) | null = null;

export function setErrorReporter(fn: (err: unknown, context?: LogContext) => void) {
  reportError = fn;
}

function emit(level: LogLevel, message: string, err?: unknown, context?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
    ...(err !== undefined ? { error: serializeError(err) } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    if (reportError) {
      try {
        reportError(err, { message, ...context });
      } catch {
        // Never let the error reporter throw and mask the original failure.
      }
    }
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    if (!isProd) console.debug(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, undefined, context),
  info: (message: string, context?: LogContext) => emit("info", message, undefined, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, undefined, context),
  error: (message: string, err?: unknown, context?: LogContext) => emit("error", message, err, context),
};
