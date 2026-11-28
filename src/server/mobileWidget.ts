import "server-only";

import { localHour } from "@/lib/brief";
import { addDays, localDate } from "@/lib/calendar";
import { widgetFlag } from "@/lib/featureFlags";
import type { DayMeals } from "@/lib/meals";
import { widgetSummary, type WidgetSummary } from "@/lib/mobileWidget";

import { choreBoard } from "./chores";
import { featureOn, loadDisplayConfig } from "./featureFlags";
import { mealsBetween } from "./meals";
import { listShopping } from "./shopping";

/** The home-screen widget's summary for one household. A list whose widget flag is off reads as empty. */
export async function widgetSummaryFor(accountId: string, now = Date.now()): Promise<WidgetSummary> {
  const { config } = await loadDisplayConfig(accountId);
  const zone = config.location.timeZone;
  const today = localDate(now, zone);
  const [mealsOn, shoppingOn, choresOn] = await Promise.all([
    featureOn(widgetFlag("meals")),
    featureOn(widgetFlag("shopping")),
    featureOn(widgetFlag("chores")),
  ]);
  const [meals, shopping, chores] = await Promise.all([
    mealsOn ? mealsBetween(accountId, today, 2) : Promise.resolve({} as Record<string, DayMeals>),
    shoppingOn ? listShopping(accountId, now) : Promise.resolve(null),
    choresOn && config.chores.items.length ? choreBoard(accountId, config, now) : Promise.resolve(null),
  ]);
  return widgetSummary({
    today,
    hour: localHour(now, zone),
    todayMeals: meals[today] ?? {},
    tomorrowMeals: meals[addDays(today, 1)] ?? {},
    shopping,
    chores,
    now,
  });
}
