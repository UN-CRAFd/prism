import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "external_coverage",
  fields: ["type", "description", "reach_indicator", "links"],
});
