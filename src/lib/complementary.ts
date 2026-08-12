import { optionValues } from "@/lib/options";

// Complementary funding: the contribution type is admin-editable (Settings →
// Dropdown options). Activity-linking + amount formatting reuse the transfers
// helpers.

export function fundingTypes(): string[] {
  return optionValues("complementaryFundingType");
}

// Badge colours kept in code (valid Tailwind classes), keyed by the type text;
// unknown/added types fall back to a neutral treatment via fundingTypeColor().
export const FUNDING_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "In Cash": { bg: "bg-green-50", text: "text-green-700", border: "border-green-300" },
  "In Kind": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
};
