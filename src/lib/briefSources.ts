// Morning brief sources (Melvin, 2026-11-26), apart from src/lib/brief.ts so the settings schema and the widget list,
// which the display bundle imports, don't pull in the brief's composing code.

export const BRIEF_SOURCES = ["alerts", "school", "weather", "calendar", "garbage", "ferries", "commute", "meals"] as const;
export type BriefSource = (typeof BRIEF_SOURCES)[number];

export const BRIEF_SOURCE_LABELS: Record<BriefSource, string> = {
  alerts: "Emergency alerts",
  school: "School closures",
  weather: "Weather",
  calendar: "Calendar, birthdays and holidays",
  garbage: "Garbage day",
  ferries: "Ferry delays and cancellations",
  commute: "Heavy traffic",
  meals: "What's for dinner",
};
