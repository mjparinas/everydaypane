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
  "calendarWeek",
  "calendarUpNext",
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

/**
 * Household trial (Melvin, 2026-11-28: "can do you all 5", after the coordinator's 14-day trial idea): every new
 * household gets Household for 14 days with no card, and drops back to Free by itself when it ends. A Free household
 * that never had one can start it from any "Try Household" button. Stored as `accounts.trial_ends_at`; the stored
 * plan stays what Stripe or staff set, and the plan everything reads is worked out from both.
 */
export const TRIAL_DAYS = 14;
export const TRIAL_MS = TRIAL_DAYS * 86_400_000;

/** The plan a household has right now: Household while it pays (or staff granted it) or while its trial runs. */
export function effectivePlan(stored: PlanId, trialEndsAt: number | null, now = Date.now()): PlanId {
  return stored === "paid" || (trialEndsAt !== null && trialEndsAt > now) ? "paid" : "free";
}

/** Whole days left in a trial, rounded up (the last afternoon still reads "1 day left"); 0 once it's over. */
export function trialDaysLeft(trialEndsAt: number | null, now = Date.now()): number {
  return trialEndsAt === null || trialEndsAt <= now ? 0 : Math.ceil((trialEndsAt - now) / 86_400_000);
}

export function planLabel(plan: PlanId): string {
  return plan === "paid" ? "Household" : "Free";
}

/** Household panel tabs that Free can open only as an upgrade prompt (Melvin, 2026-11-23). */
export const HOUSEHOLD_TABS = ["schedule", "messages", "meals", "shopping"] as const;
export type HouseholdTab = (typeof HOUSEHOLD_TABS)[number];

export function isHouseholdTab(tab: string): tab is HouseholdTab {
  return (HOUSEHOLD_TABS as readonly string[]).includes(tab);
}

/**
 * Settings jump-nav groups that are mostly Household. Mixed groups (calendars, photos-music, screen)
 * stay open on Free; individual sections use badges / soft locks in the panel.
 */
export const HOUSEHOLD_SETTINGS_GROUPS = ["family", "content", "ha"] as const;

export function isHouseholdSettingsGroup(id: string): boolean {
  return (HOUSEHOLD_SETTINGS_GROUPS as readonly string[]).includes(id);
}

/** Short reasons shown on the in-app upgrade screen when a Free user hits a paid control. */
export const UPGRADE_REASONS = {
  widget: "That widget is on Household.",
  view: `Free includes ${FREE_LIMITS.views} view. Household unlocks up to ${PAID_LIMITS.views}.`,
  template: "That starter layout uses Household widgets.",
  display: `Free includes ${FREE_LIMITS.displays} displays. Household unlocks up to ${PAID_LIMITS.displays}.`,
  calendar: `Free includes ${FREE_LIMITS.calendars} calendars. Household unlocks more.`,
  schedule: "Time-of-day schedules and view rotation are on Household.",
  meals: "Meal planning on the wall and from phones is on Household.",
  shopping: "The shared shopping list is on Household.",
  messages: "The family message board is on Household.",
  tasks: "Google Tasks, Microsoft To Do and Todoist need Household.",
  icals: "iCal calendar links need Household.",
  music: "Spotify, Sonos and Home Assistant music need Household.",
  ha: "Home Assistant, cameras and smart devices need Household.",
  smartHome: "Nest, ecobee, SmartThings, Govee, Hue, LIFX and weather stations need Household.",
  family: "Garbage day, commute, chores, sports and school status need Household.",
  content: "News, finance, Fitbit, Oura, Slack and similar connections need Household.",
  screenSaver: "The screen saver is on Household.",
  messagePopups: "Message pop-ups on the wall are on Household.",
  backup: "Settings backup and restore need Household.",
  alertEmail: "Emailing new red-strip alerts needs Household.",
  refresh: "Instant display refresh is on Household.",
  default: "Household unlocks every widget, more views and the family tools.",
} as const;

export type UpgradeReasonKey = keyof typeof UPGRADE_REASONS;
