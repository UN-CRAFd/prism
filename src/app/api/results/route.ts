import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "results",
  fields: ["context", "data_driven_decision", "resulting_impact", "links"],
});
