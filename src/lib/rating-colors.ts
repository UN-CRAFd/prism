// Rating badge colours — one shared ramp for every 1–5 rating in the platform:
// survey ratings (assessment) and risk likelihood / impact / risk level.
//
// A slight single-hue ramp in CRAF'd light orange: a little stronger per step
// from 1 to 5, showing "more" without implying good or bad. Deliberately no
// green/red and no stand-out middle — such colours nudge partners' answers
// toward the "right-looking" ones. Text stays dark on every step so all values
// read equally well.
export interface RatingColors { bg: string; text: string; border: string }

export const RATING_RAMP: Record<number, RatingColors> = {
  1: { bg: "bg-crafd-yellow-100", text: "text-crafd-grey-900", border: "border-crafd-yellow-300" },
  2: { bg: "bg-crafd-yellow-150", text: "text-crafd-grey-900", border: "border-crafd-yellow-400" },
  3: { bg: "bg-crafd-yellow-200", text: "text-crafd-grey-900", border: "border-crafd-yellow-500" },
  4: { bg: "bg-crafd-yellow-300", text: "text-crafd-grey-900", border: "border-crafd-yellow-600" },
  5: { bg: "bg-crafd-yellow-400", text: "text-crafd-grey-900", border: "border-crafd-yellow" },
};

// Survey ratings (assessment 1–5).
export const ASSESSMENT_COLORS = RATING_RAMP;
