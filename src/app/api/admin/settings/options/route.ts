import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { getOptionOverrides, setOptionOverrides } from "@/lib/option-settings";
import { baseOptions } from "@/lib/options";
import { logger } from "@/lib/logger";

// Read / replace the admin-authored dropdown-option overrides. Admin-only
// (enforced server-side via requireAdmin). Overrides are a partial
// `{ groupKey: { items: OptionItem[] } }` map merged over the compiled-in
// defaults at render time (see lib/options.ts + the root layout).

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  try {
    const overrides = await getOptionOverrides();
    return NextResponse.json({ overrides });
  } catch (err) {
    logger.error("GET /api/admin/settings/options error:", err);
    return NextResponse.json({ error: "Failed to load option overrides" }, { status: 500 });
  }
}

// Validate/normalise a single group's items into clean OptionItems. Throws a
// string message on invalid input so PUT can return a 400.
function normaliseItems(groupKey: string, raw: unknown): { value: string; label: string; description?: string }[] {
  if (!Array.isArray(raw)) throw `Group "${groupKey}" must have an items array`;
  const seen = new Set<string>();
  const items: { value: string; label: string; description?: string }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") throw `Group "${groupKey}" has an invalid item`;
    const e = entry as Record<string, unknown>;
    const value = typeof e.value === "string" ? e.value.trim() : "";
    const label = typeof e.label === "string" ? e.label.trim() : "";
    if (!value || !label) continue; // drop blank rows
    if (seen.has(value)) throw `Group "${groupKey}" has duplicate value "${value}"`;
    seen.add(value);
    const item: { value: string; label: string; description?: string } = { value, label };
    if (typeof e.description === "string" && e.description.trim()) {
      item.description = e.description.trim();
    }
    items.push(item);
  }
  if (items.length === 0) throw `Group "${groupKey}" must have at least one option`;
  return items;
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  let body: { overrides?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const overrides = body.overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return NextResponse.json({ error: "`overrides` must be an object" }, { status: 400 });
  }

  // Build a clean overrides map: only known groups, normalised items.
  const clean: Record<string, { items: unknown }> = {};
  try {
    for (const [groupKey, val] of Object.entries(overrides as Record<string, unknown>)) {
      if (!(groupKey in baseOptions)) {
        return NextResponse.json({ error: `Unknown option group "${groupKey}"` }, { status: 400 });
      }
      const rawItems = (val && typeof val === "object" && !Array.isArray(val))
        ? (val as Record<string, unknown>).items
        : val; // tolerate a bare array too
      clean[groupKey] = { items: normaliseItems(groupKey, rawItems) };
    }
  } catch (msg) {
    return NextResponse.json({ error: typeof msg === "string" ? msg : "Invalid options" }, { status: 400 });
  }

  try {
    await setOptionOverrides(clean);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("PUT /api/admin/settings/options error:", err);
    return NextResponse.json({ error: "Failed to save option overrides" }, { status: 500 });
  }
}
