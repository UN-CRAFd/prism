import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "partnerships",
  fields: ["partner_organization", "result", "links"],
});
