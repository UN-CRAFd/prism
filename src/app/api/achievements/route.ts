import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "key_achievements",
  fields: ["achievement", "significance", "links"],
  max: 3,
  maxMessage: "Maximum of 3 achievements per report",
});
