// Kept apart from schema.ts so the display can import it without pulling in zod.
export const PERIODS = ["morning", "afternoon", "evening", "night"] as const;
export type Period = (typeof PERIODS)[number];
