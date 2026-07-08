import { makeSectionRoute } from "@/lib/section-route";

export const { GET, POST, PATCH, DELETE } = makeSectionRoute({
  table: "lessons_learned",
  fields: ["category", "lesson_learned", "adjustment_informed"],
  max: 5,
  maxMessage: "Maximum of 5 lessons per report",
});
