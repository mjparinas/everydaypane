// Meal planning (Melvin, 2026-11-17: "add meal planning", with breakfast, lunch and dinner for each day). Shared by the
// server, the admin panel and the display, so it holds no zod and no React.
// Recurring cadences (Melvin, 2026-11-23): rules fill future days so the family doesn't re-type known routines
// (cereal every Monday, eggs every Tuesday, pasta every other day). One-off rows still override a single day.

import { addDays } from "./calendar";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_LABELS: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export const MEAL_ICONS: Record<MealSlot, string> = { breakfast: "🥣", lunch: "🥪", dinner: "🍽️" };

/** One day's plan; a slot nobody filled in is left out. */
export type DayMeals = Partial<Record<MealSlot, string>>;

/** Short weekday names (Sunday first), matching chores. */
export const MEAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** How often a recurring meal lands. `weekdays` = chosen days each week; `interval` = every N days from start. */
export type MealRepeat = { kind: "weekdays"; days: number[] } | { kind: "interval"; every: number };

export type MealRule = {
  id: string;
  slot: MealSlot;
  text: string;
  repeat: MealRepeat;
  /** First date the rule can fill (YYYY-MM-DD); also the anchor for interval rules. */
  start: string;
};

/** Where a planned meal came from, for the phone planner (wall only needs the merged text). */
export type MealOrigin = { source: "once" } | { source: "rule"; ruleId: string };

export type MealOrigins = Record<string, Partial<Record<MealSlot, MealOrigin>>>;

const DAY = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

/** 0 = Sunday … 6 = Saturday. */
export const mealWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

const uniqDays = (days: number[]) => [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);

/** Normalise a repeat payload; returns null when the cadence is empty or out of range. */
export function normalizeRepeat(repeat: MealRepeat): MealRepeat | null {
  if (repeat.kind === "weekdays") {
    const days = uniqDays(repeat.days);
    return days.length ? { kind: "weekdays", days } : null;
  }
  const every = Math.floor(repeat.every);
  return every >= 1 && every <= 14 ? { kind: "interval", every } : null;
}

/** Whether a rule lands on a local date (inclusive of start). */
export function ruleApplies(rule: Pick<MealRule, "repeat" | "start">, date: string): boolean {
  if (date < rule.start) return false;
  if (rule.repeat.kind === "weekdays") return rule.repeat.days.includes(mealWeekday(date));
  return (dayNumber(date) - dayNumber(rule.start)) % rule.repeat.every === 0;
}

/** Human label for a cadence ("Every Mon", "Every 2 days", "Weekdays"). */
export function repeatLabel(repeat: MealRepeat): string {
  if (repeat.kind === "interval") return repeat.every === 1 ? "Every day" : `Every ${repeat.every} days`;
  const set = new Set(repeat.days);
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return `Every ${[1, 2, 3, 4, 5, 6, 0]
    .filter((d) => set.has(d))
    .map((d) => MEAL_WEEKDAYS[d])
    .join(", ")}`;
}

/**
 * Expand rules into a date range, then overlay one-off rows. An empty one-off text means "skip this day" (blocks the
 * rule). Among overlapping rules for the same slot, the last in `rules` wins (callers should pass newest last).
 */
export function mergeMealPlan(
  from: string,
  days: number,
  rules: readonly MealRule[],
  once: Record<string, Partial<Record<MealSlot, string | null>>>,
): { meals: Record<string, DayMeals>; origins: MealOrigins } {
  const meals: Record<string, DayMeals> = {};
  const origins: MealOrigins = {};
  const end = addDays(from, days);
  for (let date = from; date < end; date = addDays(date, 1)) {
    for (const rule of rules) {
      if (!ruleApplies(rule, date)) continue;
      (meals[date] ??= {})[rule.slot] = rule.text;
      (origins[date] ??= {})[rule.slot] = { source: "rule", ruleId: rule.id };
    }
    const dayOnce = once[date];
    if (!dayOnce) continue;
    for (const slot of MEAL_SLOTS) {
      if (!(slot in dayOnce)) continue;
      const text = dayOnce[slot];
      if (text == null || text === "") {
        const dayMeals = meals[date];
        if (dayMeals) {
          delete dayMeals[slot];
          if (!Object.keys(dayMeals).length) delete meals[date];
        }
        const dayOrigins = origins[date];
        if (dayOrigins) {
          delete dayOrigins[slot];
          if (!Object.keys(dayOrigins).length) delete origins[date];
        }
      } else {
        (meals[date] ??= {})[slot] = text;
        (origins[date] ??= {})[slot] = { source: "once" };
      }
    }
  }
  return { meals, origins };
}

/**
 * Which meal is coming up at a given local hour: breakfast until 10 AM, lunch until 2 PM, dinner until 8 PM. From 8 PM
 * the next meal is tomorrow's breakfast, so the wall answers "what's for breakfast?" at bedtime.
 */
export function nextMeal(hour: number): { slot: MealSlot; tomorrow: boolean } {
  if (hour < 10) return { slot: "breakfast", tomorrow: false };
  if (hour < 14) return { slot: "lunch", tomorrow: false };
  if (hour < 20) return { slot: "dinner", tomorrow: false };
  return { slot: "breakfast", tomorrow: true };
}
