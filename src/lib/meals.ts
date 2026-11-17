// Meal planning (Melvin, 2026-11-17: "add meal planning", with breakfast, lunch and dinner for each day). Shared by the
// server, the admin panel and the display, so it holds no zod and no React.

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_LABELS: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export const MEAL_ICONS: Record<MealSlot, string> = { breakfast: "🥣", lunch: "🥪", dinner: "🍽️" };

/** One day's plan; a slot nobody filled in is left out. */
export type DayMeals = Partial<Record<MealSlot, string>>;

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
