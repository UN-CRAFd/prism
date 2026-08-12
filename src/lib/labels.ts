import base from "./labels.json";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime-editable UI labels.
//
// Every component/route imports the default export of this module (NOT the raw
// labels.json) so that admin-authored overrides can take effect live, without a
// redeploy. Overrides are stored in app_settings (see lib/label-settings.ts),
// applied to the SERVER copy during the root layout render, and injected into the
// initial HTML as `window.__LABEL_OVERRIDES__` so the CLIENT copy is patched
// before first paint (server and client render identical text — no hydration
// mismatch).
//
// Why in-place mutation: ~35 files read from a single shared object, some at
// module scope (`const g = labels.generalInfo`). We deep-merge override *leaf*
// values into that same object reference, so those captured sub-objects reflect
// the change too — no per-file rewrite to a hook was needed.
// ─────────────────────────────────────────────────────────────────────────────

export type Labels = typeof base;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Pristine defaults — never mutated. Used by the admin labels editor to show
 *  the original text and to compute which values are overrides. */
export const baseLabels: Labels = base;

/** The live, shared labels object every consumer imports. */
const labels: Labels = clone(base);

/** Deep-merge `source` into `target`, mutating existing nested objects AND arrays
 *  in place (so both sub-object and array references captured at module scope
 *  elsewhere stay valid and reflect the override). Strings are replaced; unknown
 *  keys are added. */
function mergeInPlace(target: Record<string, unknown>, source: unknown): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [key, sv] of Object.entries(source as Record<string, unknown>)) {
    const tv = target[key];
    if (Array.isArray(sv) && Array.isArray(tv)) {
      // Replace contents in place — keeps the array reference stable.
      tv.length = 0;
      (tv as unknown[]).push(...sv);
    } else if (
      sv && typeof sv === "object" && !Array.isArray(sv) &&
      tv && typeof tv === "object" && !Array.isArray(tv)
    ) {
      mergeInPlace(tv as Record<string, unknown>, sv);
    } else {
      target[key] = sv;
    }
  }
}

/** Apply admin overrides onto the live labels object (idempotent). */
export function applyLabelOverrides(overrides: unknown): void {
  if (overrides && typeof overrides === "object") {
    mergeInPlace(labels as Record<string, unknown>, overrides);
  }
}

// On the client the server injects overrides as a global before the app bundle
// runs, so patch the singleton at module init — before any component renders.
if (typeof window !== "undefined") {
  const injected = (window as unknown as { __LABEL_OVERRIDES__?: unknown }).__LABEL_OVERRIDES__;
  if (injected) applyLabelOverrides(injected);
}

// ── Helpers for the admin labels editor ─────────────────────────────────────

export interface LabelLeaf {
  /** Dot path, e.g. "generalInfo.fields.startDate". */
  path: string;
  /** Base (default) value. Arrays are joined with newlines. */
  base: string;
  kind: "string" | "array";
}

/** Flatten the label tree into editable string / string[] leaves (dot paths).
 *  Non-string, non-string-array values are skipped (none exist today). */
export function flattenLabelLeaves(obj: unknown, prefix = ""): LabelLeaf[] {
  const out: LabelLeaf[] = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out.push({ path, base: v, kind: "string" });
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out.push({ path, base: (v as string[]).join("\n"), kind: "array" });
    } else if (v && typeof v === "object") {
      out.push(...flattenLabelLeaves(v, path));
    }
  }
  return out;
}

/** Assign `value` at a dot path inside `target`, creating intermediate objects. */
export function setNested(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

export default labels;
