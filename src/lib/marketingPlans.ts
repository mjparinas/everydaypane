// Marketing Free vs Household pricing copy. Plan ids match src/lib/plans.ts (free | paid).

export type MarketingPlanId = "free" | "paid";

export interface MarketingPlan {
  id: MarketingPlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  blurb: string;
  highlighted?: boolean;
  badge?: string;
  cta: string;
  features: string[];
}

export const MARKETING_PLANS: MarketingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    blurb: "Two wall displays with the essentials. No card, no ads.",
    cta: "Start Free",
    features: [
      "2 wall displays and 1 view",
      "Clock, date, weather, sunrise & sunset, air quality",
      "Photos, notes, WiFi QR and countdowns",
      "Google Calendar (up to 2 calendars)",
      "Schedule and month calendar",
      "Day and night themes",
      "Offline mode and burn-in protection",
    ],
  },
  {
    id: "paid",
    name: "Household",
    priceMonthly: 7,
    priceYearly: 59,
    blurb: "The whole house on every screen. Best value for a busy family.",
    highlighted: true,
    badge: "Best value",
    cta: "Get Household",
    features: [
      "Everything in Free",
      "Up to 20 displays and 30 views",
      "All widgets: chores, meals, shopping, sports, transit, commute, radar, ferries, timers and more",
      "Up to 50 calendars, Google Tasks, iCal links",
      "Home Assistant, UniFi cameras, Spotify and Sonos",
      "Message board, school status and who's home",
      "Emergency alerts for BC, with optional email",
      "Time-of-day schedules and screen saver",
      "Instant display refresh and settings backup",
    ],
  },
];

export const MARKETING_PLAN_TABLE: { feature: string; free: boolean | string; paid: boolean | string }[] = [
  { feature: "Wall displays", free: "2", paid: "20" },
  { feature: "Views", free: "1", paid: "30" },
  { feature: "Clock, date, weather, air quality", free: true, paid: true },
  { feature: "Photos, notes, WiFi QR, countdowns", free: true, paid: true },
  { feature: "Google Calendar", free: "2 calendars", paid: "Up to 50" },
  { feature: "iCal calendar links", free: false, paid: true },
  { feature: "Google Tasks (tap to tick)", free: false, paid: true },
  { feature: "Meals, shopping list, message board", free: false, paid: true },
  { feature: "Chore chart with stars", free: false, paid: true },
  { feature: "TransLink, commute, rain radar, BC Ferries", free: false, paid: true },
  { feature: "Sports scores", free: false, paid: true },
  { feature: "Home Assistant & UniFi cameras", free: false, paid: true },
  { feature: "Music (Spotify, Sonos, HA)", free: false, paid: true },
  { feature: "Timers & pomodoro", free: false, paid: true },
  { feature: "Garbage day (Township of Langley)", free: false, paid: true },
  { feature: "School status & who's home", free: false, paid: true },
  { feature: "Emergency alerts + email", free: "Strip only", paid: "Strip + email" },
  { feature: "Multi-view & time-of-day schedule", free: false, paid: true },
  { feature: "Screen saver", free: false, paid: true },
  { feature: "Instant display refresh", free: false, paid: true },
  { feature: "Ads", free: "None", paid: "None" },
];

export function usd(n: number): string {
  return n === 0 ? "$0" : `$${n.toFixed(n % 1 ? 2 : 0)}`;
}
