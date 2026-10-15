import labels from "@/lib/labels";

export const PRODOC_SECTIONS: { value: string; label: string; muted?: boolean; adminOnly?: boolean; hidden?: boolean }[] = [
  { value: "general", get label() { return labels.sections.general; } },
  { value: "narratives", get label() { return labels.sections.narratives; } },
  { value: "sdg", get label() { return labels.sections.sdg; }, hidden: true }, // hidden for now
  { value: "workplan", get label() { return labels.sections.workplan; } },
  { value: "indicators", get label() { return labels.sections.indicators; } },
  { value: "risk", get label() { return labels.sections.risk; } },
  // "Budgets" is the prodoc-editor label for the expenditure section (the report
  // editor keeps "Expenditure"); it sits after the workplan tab here.
  { value: "expenditure", label: "Budgets" },
  { value: "signatures", get label() { return labels.sections.signatures; }, adminOnly: true },
  { value: "documents", get label() { return labels.sections.documents; } },
];

export function partnerProdocSections() {
  return PRODOC_SECTIONS.filter((s) => !s.hidden && !s.adminOnly);
}
