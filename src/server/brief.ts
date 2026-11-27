import "server-only";

import { composeBrief, type BriefInput } from "@/lib/brief";
import type { BriefSource } from "@/lib/briefSources";
import { localDate } from "@/lib/calendar";
import type { CountdownEvent, DashboardConfig, Widget } from "@/lib/config/schema";
import type { BriefData } from "@/lib/display/types";
import { widgetFlag } from "@/lib/featureFlags";

import { alertsFeed } from "./alerts";
import { combinedFeed } from "./calendars";
import { commuteFeed } from "./commute";
import { flagsOff } from "./featureFlags";
import { ferriesFeed } from "./ferries";
import { garbageFeed } from "./garbage";
import { mealsBetween } from "./meals";
import { schoolStatus } from "./school";
import { weather } from "./weather";

// Morning brief (Melvin, 2026-11-26). Every source here is a feed the wall already reads, each with its own cache, so
// a brief costs no new calls to anyone for a household whose widgets already show that data. One source failing only
// drops its phrases (src/lib/brief.ts composes them).

type BriefWidget = Extract<Widget, { type: "brief" }>;

const has = (config: DashboardConfig, type: Widget["type"]) => config.views.some((v) => v.widgets.some((w) => w.type === type));

/** Countdown events (birthdays, holidays) on any countdown widget, once each. */
function countdownEvents(config: DashboardConfig): CountdownEvent[] {
  const byId = new Map<string, CountdownEvent>();
  for (const v of config.views) for (const w of v.widgets) if (w.type === "countdown") for (const e of w.events) byId.set(e.id, e);
  return [...byId.values()];
}

const quiet = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined);

export async function briefFeed(
  accountId: string,
  config: DashboardConfig,
  w: Pick<BriefWidget, "sources" | "eveningTomorrow">,
  now = Date.now(),
): Promise<BriefData> {
  const off = await flagsOff();
  const on = (s: BriefSource) => w.sources.includes(s);
  const flag = (t: Widget["type"]) => !off.has(widgetFlag(t));
  const tz = config.location.timeZone;
  const alertsOn = on("alerts") && config.alerts.enabled;
  // The district page defaults to Langley's, so it only counts for a household that put a school widget up.
  const schoolOn = on("school") && has(config, "school");
  const garbageOn = on("garbage") && flag("garbage") && Boolean(config.integrations.garbage.zoneId);
  const commuteOn = on("commute") && flag("commute") && Boolean(config.integrations.commute.home);
  const mealsOn = on("meals") && flag("meals");

  const [wx, alerts, school, calendar, garbage, ferries, commute, meals] = await Promise.all([
    on("weather") ? quiet(weather(config).then((c) => c.value)) : undefined,
    alertsOn ? quiet(alertsFeed(config, now)) : undefined,
    schoolOn ? quiet(schoolStatus(config, now)) : undefined,
    on("calendar") ? quiet(combinedFeed(accountId, config, now).then((f) => f.data)) : undefined,
    garbageOn ? quiet(garbageFeed(config, now).then((c) => c.value)) : undefined,
    on("ferries") ? quiet(ferriesFeed(config, now)) : undefined,
    commuteOn ? quiet(commuteFeed(config, now)) : undefined,
    mealsOn
      ? quiet(
          (async () => {
            const today = localDate(now, tz);
            return { today, meals: await mealsBetween(accountId, today, 2) };
          })(),
        )
      : undefined,
  ]);

  const input: BriefInput = {
    now,
    timeZone: tz,
    hour12: config.hour12,
    eveningTomorrow: w.eveningTomorrow,
    banner: config.alerts.banner,
    ...(wx ? { weather: wx } : {}),
    ...(alerts ? { alerts } : {}),
    ...(school ? { school } : {}),
    ...(calendar ? { calendar } : {}),
    ...(on("calendar") ? { countdowns: countdownEvents(config) } : {}),
    ...(garbage ? { garbage } : {}),
    ...(ferries ? { ferries } : {}),
    ...(commute ? { commute } : {}),
    ...(meals ? { meals } : {}),
  };
  return composeBrief(input);
}
