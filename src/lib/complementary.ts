import labels from "@/lib/labels.json";

// Complementary funding: the contribution is typed "In Cash" / "In Kind". The
// activity-linking + amount formatting reuse the transfers helpers.

export const FUNDING_TYPES: string[] = labels.complementary.fundingTypes;

export const FUNDING_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "In Cash": { bg: "bg-green-50", text: "text-green-700", border: "border-green-300" },
  "In Kind": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
};
