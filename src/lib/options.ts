import baseJson from "./options.json";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime-editable dropdown option lists ("choice enums").
//
// Same mechanism as lib/labels.ts: every consumer imports accessors from THIS
// module (not options.json), so admin-authored overrides take effect live without
// a redeploy. Overrides are stored in app_settings (see lib/option-settings.ts),
// applied to the SERVER copy during the root layout render, and injected into the
// initial HTML as `window.__OPTION_OVERRIDES__` so the CLIENT copy is patched
// before first paint (server and client render identical markup — no hydration
// mismatch).
//
// Item arrays are merged IN PLACE (length reset + push) so a reference captured at
// module scope (`const items = options.workplanStatus.items`) reflects edits too.
//
// NOTE: API routes do not render the root layout, so any route that validates an
// incoming value against these lists must first load overrides itself — call
// applyOptionOverrides(await getOptionOverrides()) before reading the accessors.
// ─────────────────────────────────────────────────────────────────────────────

export interface OptionItem {
  /** Stored/persisted value. For "flat" groups this equals the label. */
  value: string;
  /** Display text shown in the dropdown. */
  label: string;
  /** Optional helper text (only some groups use it, e.g. workplan status). */
  description?: string;
}

export interface OptionGroup {
  /** Human-friendly name of this dropdown, shown in the admin editor. */
  label: string;
  /** Help text describing where the dropdown appears. */
  description: string;
  /** "flat": value mirrors label (single field). "keyed": stable value + label. */
  kind: "flat" | "keyed";
  /** Whether items carry an editable description field. */
  hasDescription?: boolean;
  items: OptionItem[];
}

export type OptionsRegistry = Record<string, OptionGroup>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Pristine defaults — never mutated. Used by the admin editor. */
export const baseOptions: OptionsRegistry = baseJson as OptionsRegistry;

/** The live, shared registry every consumer reads through the accessors below. */
const options: OptionsRegistry = clone(baseOptions);

/** Deep-merge override `items` arrays onto the live registry, mutating existing
 *  arrays/objects in place so module-scope references stay valid. Only known
 *  groups are patched; unknown keys in overrides are ignored. */
function mergeInPlace(target: Record<string, unknown>, source: unknown): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [key, sv] of Object.entries(source as Record<string, unknown>)) {
    const tv = target[key];
    if (Array.isArray(sv)) {
      if (Array.isArray(tv)) {
        tv.length = 0;
        (tv as unknown[]).push(...sv);
      } else {
        target[key] = sv;
      }
    } else if (
      sv && typeof sv === "object" &&
      tv && typeof tv === "object" && !Array.isArray(tv)
    ) {
      mergeInPlace(tv as Record<string, unknown>, sv);
    } else {
      target[key] = sv;
    }
  }
}

/** Apply admin overrides onto the live options registry (idempotent). Overrides
 *  are a partial `{ groupKey: { items: OptionItem[] } }` map. */
export function applyOptionOverrides(overrides: unknown): void {
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    // Only patch groups that exist in the base registry.
    const filtered: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(overrides as Record<string, unknown>)) {
      if (key in options) filtered[key] = val;
    }
    mergeInPlace(options as unknown as Record<string, unknown>, filtered);
  }
}

// On the client the server injects overrides as a global before the app bundle
// runs, so patch the singleton at module init — before any component renders.
if (typeof window !== "undefined") {
  const injected = (window as unknown as { __OPTION_OVERRIDES__?: unknown }).__OPTION_OVERRIDES__;
  if (injected) applyOptionOverrides(injected);
}

// ── Accessors (read the live singleton every call) ───────────────────────────

/** Live items for a group, or [] for an unknown key. */
export function optionItems(key: string): OptionItem[] {
  return options[key]?.items ?? [];
}

/** Live list of stored values for a group. */
export function optionValues(key: string): string[] {
  return optionItems(key).map((i) => i.value);
}

/** Display label for a stored value, falling back to the value itself. */
export function optionLabel(key: string, value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return optionItems(key).find((i) => i.value === value)?.label ?? value;
}

/** Optional description for a stored value, or "" if none. */
export function optionDescription(key: string, value: string | null | undefined): string {
  if (!value) return "";
  return optionItems(key).find((i) => i.value === value)?.description ?? "";
}

export default options;
