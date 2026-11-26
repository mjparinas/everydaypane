import "server-only";

import { evaluateRules, rulesNeed, type RuleInputs } from "@/lib/alertRules";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert } from "@/lib/display/types";
import { widgetFlag } from "@/lib/featureFlags";

import { airthingsFeed } from "./airthings";
import { blueRiiotFeed } from "./blueRiiot";
import { ecoflowFeed } from "./ecoflow";
import { flagsOff } from "./featureFlags";
import { garbageFeed } from "./garbage";
import { laundryFeed } from "./laundry";
import { rachioFeed } from "./rachio";
import { air, weather } from "./weather";

/**
 * Smart notices for the alerts route (src/lib/alertRules.ts). Only the feeds a switched-on rule reads are fetched,
 * and a feed whose widget is switched off platform-wide is never called. Every feed here is already cached per
 * household (or per place, for weather and air), so the alerts poll adds no calls a widget wouldn't make. One feed
 * failing only quiets its rules.
 */
export async function ruleAlertsFor(
  accountId: string,
  config: DashboardConfig,
  area: EmergencyAlert[],
  now = Date.now(),
): Promise<EmergencyAlert[]> {
  if (!config.alerts.enabled) return [];
  const need = rulesNeed(config.alerts.rules);
  if (!need.size) return [];
  const off = await flagsOff(now);
  const on = (type: Parameters<typeof widgetFlag>[0]) => !off.has(widgetFlag(type));
  const want = (k: keyof RuleInputs, type?: Parameters<typeof widgetFlag>[0]) => need.has(k) && (!type || on(type));
  const quiet = <T>(p: Promise<T>) => p.catch(() => undefined);

  // EcoFlow only while an outage covers the home, so a quiet day makes no EcoFlow calls from here.
  const outage = area.some((x) => x.source === "power" && x.severity === "severe");
  const [a, rachio, ecoflow, pool, laundry, garbage] = await Promise.all([
    want("air") ? quiet(air(config).then((r) => r.value)) : undefined,
    want("rachio", "rachio") ? quiet(rachioFeed(accountId, now)) : undefined,
    outage && want("ecoflow", "ecoflow") ? quiet(ecoflowFeed(accountId, config, now)) : undefined,
    want("pool", "blueRiiot") ? quiet(blueRiiotFeed(accountId, config, now)) : undefined,
    want("laundry", "laundry") ? quiet(laundryFeed(accountId, config, now)) : undefined,
    want("garbage", "garbage") ? quiet(garbageFeed(config, now).then((r) => r.value)) : undefined,
  ]);

  // Rachio, EcoFlow, Blue Riiot and the laundry need a connection; the forecast is read only when one that uses it has.
  const inputs: RuleInputs = { area };
  if (rachio?.configured) inputs.rachio = rachio;
  if (ecoflow?.configured) inputs.ecoflow = ecoflow;
  if (pool?.configured) inputs.pool = pool;
  if (laundry?.configured) inputs.laundry = laundry;
  if (garbage) inputs.garbage = garbage;
  if (a) inputs.air = a;
  // Indoor PM2.5 only adds a line to a smoky-air notice, so Airthings is read only when the air outside is poor.
  if (a && a.aqhi >= config.alerts.rules.smokyAqhi && want("indoor", "airthings")) {
    const indoor = await quiet(airthingsFeed(accountId, config, now));
    if (indoor?.configured) inputs.indoor = indoor;
  }
  if (want("weather") && (inputs.rachio || inputs.pool)) {
    const w = await quiet(weather(config).then((r) => r.value));
    if (w) inputs.weather = w;
  }
  return evaluateRules(config, inputs, now);
}
