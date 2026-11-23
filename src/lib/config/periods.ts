// Kept apart from schema.ts so the display can import it without pulling in zod.
export const PERIODS = ["morning", "afternoon", "evening", "night"] as const;
export type Period = (typeof PERIODS)[number];

/** Labels people see. The overnight period's key stays `night` in the settings document. */
export const PERIOD_LABELS: Record<Period, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Overnight",
};
