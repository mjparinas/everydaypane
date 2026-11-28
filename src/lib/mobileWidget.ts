import type { ChoresData, ShoppingData } from "@/lib/display/types";
import type { DayMeals } from "@/lib/meals";

// What the app's home-screen widgets show (Melvin, 2026-11-27: native widgets for iOS and Android). Kept small and
// flat so Swift and Kotlin read it without a schema library: tonight's dinner, the open shopping list and the chores
// still to do today. Widgets refresh every half hour or so, and the app refreshes them whenever the family edits a
// list from the phone.

export interface WidgetSummary {
  /** The household's local day, YYYY-MM-DD. */
  today: string;
  /** Tonight's dinner (tomorrow's once it's past 8 PM), or null when nothing is planned. */
  dinner: { label: "Tonight" | "Tomorrow"; text: string } | null;
  shopping: { open: number; low: number; items: string[] };
  chores: { left: number; total: number; people: { name: string; emoji: string; left: number }[] };
  updatedAt: number;
}

export const WIDGET_SHOPPING_ITEMS = 6;

export function widgetSummary(input: {
  today: string;
  hour: number;
  todayMeals: DayMeals;
  tomorrowMeals: DayMeals;
  shopping: ShoppingData | null;
  chores: ChoresData | null;
  now: number;
}): WidgetSummary {
  const evening = input.hour >= 20;
  const dinnerText = (evening ? input.tomorrowMeals.dinner : input.todayMeals.dinner)?.trim();
  const open = input.shopping?.items.filter((i) => !i.done) ?? [];
  const due = input.chores?.due ?? [];
  const people = (input.chores?.people ?? []).flatMap((p) => {
    const mine = due.filter((d) => d.personId === p.id);
    return mine.length ? [{ name: p.name, emoji: p.emoji, left: mine.filter((d) => !d.done).length }] : [];
  });
  return {
    today: input.today,
    dinner: dinnerText ? { label: evening ? "Tomorrow" : "Tonight", text: dinnerText } : null,
    shopping: { open: open.length, low: open.filter((i) => i.low).length, items: open.slice(0, WIDGET_SHOPPING_ITEMS).map((i) => i.text) },
    chores: { left: due.filter((d) => !d.done).length, total: due.length, people },
    updatedAt: input.now,
  };
}
