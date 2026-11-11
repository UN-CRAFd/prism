import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { getOptionOverrides, setOptionOverrides } from "@/lib/option-settings";
import { baseOptions, type OptionItem } from "@/lib/options";
import { logger } from "@/lib/logger";

// Add / delete Investment Theme options inline from the General Info editor.
// Themes are a regular dropdown-option group ("investmentTheme"), persisted in
// the shared option overrides (app_settings), so a theme created on one project
// is available on every project — and it also shows up under Settings →
// Dropdown options. Admin-only. Deleting a theme only removes it from the list;
// projects that already use it keep their stored value.

const GROUP = "investmentTheme";
const MAX_LEN = 100;

async function currentThemes(): Promise<{ overrides: Record<string, unknown>; items: OptionItem[] }> {
  const overrides = await getOptionOverrides();
  const group = overrides[GROUP] as { items?: unknown } | undefined;
  const items = Array.isArray(group?.items)
    ? (group!.items as OptionItem[])
    : baseOptions[GROUP].items;
  return { overrides, items: items.map((i) => ({ value: i.value, label: i.label })) };
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return NextResponse.json({ error: "Theme name is required" }, { status: 400 });
    if (name.length > MAX_LEN) return NextResponse.json({ error: `Theme must be ${MAX_LEN} characters or fewer` }, { status: 400 });

    const { overrides, items } = await currentThemes();
    const existing = items.find((i) => i.value.toLowerCase() === name.toLowerCase());
    if (existing) return NextResponse.json({ items, value: existing.value });

    const next = [...items, { value: name, label: name }];
    await setOptionOverrides({ ...overrides, [GROUP]: { items: next } });
    return NextResponse.json({ items: next, value: name });
  } catch (err) {
    logger.error("POST /api/admin/settings/investment-themes error:", err);
    return NextResponse.json({ error: "Failed to add theme" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  try {
    const value = new URL(request.url).searchParams.get("value") ?? "";
    if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });
    const { overrides, items } = await currentThemes();
    const next = items.filter((i) => i.value !== value);
    if (next.length !== items.length) {
      await setOptionOverrides({ ...overrides, [GROUP]: { items: next } });
    }
    return NextResponse.json({ items: next });
  } catch (err) {
    logger.error("DELETE /api/admin/settings/investment-themes error:", err);
    return NextResponse.json({ error: "Failed to delete theme" }, { status: 500 });
  }
}
