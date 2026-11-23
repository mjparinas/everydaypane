// Free vs Paid limits for Everydaypane as a multi-tenant product (Melvin, 2026-11-22: Free + one paid,
// DAKboard-like free defaults). Safe for admin UI and server gates — no secrets.

export type PlanId = "free" | "paid";

export const PLAN_IDS = ["free", "paid"] as const;

/** Widgets allowed on Free. Everything else needs Paid. */
export const FREE_WIDGET_TYPES = [
  "clock",
  "date",
  "weather",
  "sunTimes",
  "airQuality",
  "photos",
  "agenda",
  "calendarMonth",
  "note",
  "wifiQr",
  "countdown",
] as const;

export type FreeWidgetType = (typeof FREE_WIDGET_TYPES)[number];

export const FREE_LIMITS = {
  views: 1,
  calendars: 2,
  displays: 2,
  /** Slowest photo change on Free (seconds), in the spirit of DAKboard's free tier. */
  minPhotoIntervalSeconds: 30,
} as const;

export const PAID_LIMITS = {
  views: 30,
  calendars: 50,
  displays: 20,
  minPhotoIntervalSeconds: 5,
} as const;

export function limitsFor(plan: PlanId) {
  return plan === "paid" ? PAID_LIMITS : FREE_LIMITS;
}

export function isFreeWidgetType(type: string): type is FreeWidgetType {
  return (FREE_WIDGET_TYPES as readonly string[]).includes(type);
}

export function planLabel(plan: PlanId): string {
  return plan === "paid" ? "Household" : "Free";
}
