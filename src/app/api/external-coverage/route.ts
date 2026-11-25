import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "external_coverage",
  fields: ["type", "description", "reach_indicator", "links"],
  max: 3,
  maxMessage: "Maximum of 3 external coverage items per report",
});
