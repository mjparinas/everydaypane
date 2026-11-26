import type { DashboardConfig } from "@/lib/config/schema";
import type {
  AirData,
  AirthingsData,
  EcoFlowData,
  EmergencyAlert,
  GarbageData,
  LaundryData,
  PoolData,
  RachioData,
  WeatherData,
} from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";

// Smart notices (Melvin, 2026-11-26: "smart alerts across integrations", e.g. "the pool pH is off" or "the dryer's done
// and nobody's home"): small rules that read two feeds the household already has and put one plain line on the alert
// strip. They are household notices (`notice`): blue, dismissible, never emailed and left out of the Alerts widget,
// like "washer done". Each rule is switched in Settings › Emergency alerts › Smart notices (`config.alerts.rules`);
// the ones that would fire often are off by default (Claude's defaults, 2026-11-26). Everything here is pure, so the
// server only gathers the feeds (src/server/alertRules.ts). Pool water out of range, high radon and CO₂, and "washer
// done" already had their own switches and stay where they were.

export type AlertRules = DashboardConfig["alerts"]["rules"];

export const RULES_DEFAULT: AlertRules = {
  sprinklerFrost: true,
  sprinklerRain: false,
  outageBattery: true,
  smokyAir: true,
  smokyAqhi: 7,
  poolFreeze: false,
  laundryWaiting: false,
  laundryWaitMinutes: 60,
  garbageEve: false,
  garbageHour: 18,
};

/** The feeds a rule may read. A missing one (not set up, or switched off) just means its rules stay quiet. */
export interface RuleInputs {
  weather?: WeatherData;
  air?: AirData;
  rachio?: RachioData;
  ecoflow?: EcoFlowData;
  pool?: PoolData;
  indoor?: AirthingsData;
  laundry?: LaundryData;
  garbage?: GarbageData;
  /** The area's alerts, for the outage rule (BC Hydro outages covering the home). */
  area?: EmergencyAlert[];
}

const HOUR = 3_600_000;

const notice = (id: string, title: string, area: string, description: string, sent: number): EmergencyAlert => ({
  id: `rule:${id}`,
  source: "smart",
  severity: "minor",
  notice: true,
  title,
  area,
  description,
  sent,
  expires: null,
});

const localHourKey = (timeZone: string) =>
  zonedFormatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** "2026-11-26T06" for an instant, matching the start of the weather feed's local hour stamps. */
function hourStamp(timeZone: string, at: number): string {
  const parts = Object.fromEntries(
    localHourKey(timeZone)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
}

const localDay = (timeZone: string, at: number) =>
  zonedFormatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** Freezing in the dashboard's units: 1 °C or 34 °F (a sprinkler at 1 °C can still ice a path). */
const frostAt = (units: DashboardConfig["units"]) => (units === "imperial" ? 34 : 1);
const hardFreezeAt = (units: DashboardConfig["units"]) => (units === "imperial" ? 28 : -2);

function waterings(rachio: RachioData | undefined, now: number) {
  if (!rachio) return [];
  return rachio.controllers.flatMap((c) =>
    c.next && c.next.start > now && c.next.start - now <= 24 * HOUR && !(c.rainDelayUntil && c.rainDelayUntil > c.next.start)
      ? [{ controller: c, watering: c.next }]
      : [],
  );
}

export function evaluateRules(config: DashboardConfig, inputs: RuleInputs, now: number): EmergencyAlert[] {
  const rules = config.alerts.rules;
  const tz = config.location.timeZone;
  const time = zonedFormatter(tz, { hour: "numeric", minute: "2-digit", hour12: config.hour12 });
  const deg = config.units === "imperial" ? "°F" : "°C";
  const out: EmergencyAlert[] = [];
  const hours = inputs.weather?.hours ?? [];
  const hourAt = (at: number) => {
    const stamp = hourStamp(tz, at);
    return hours.find((h) => h.time.startsWith(stamp));
  };

  // Sprinklers (Rachio) against the forecast: a watering in the next 24 hours into frost, or into likely rain.
  for (const { controller, watering } of waterings(inputs.rachio, now)) {
    const h = hourAt(watering.start);
    if (!h) continue;
    const when = time.format(watering.start);
    if (rules.sprinklerFrost && h.temp <= frostAt(config.units))
      out.push(
        notice(
          `frost:${controller.id}:${watering.start}`,
          `Sprinklers at ${when} in ${h.temp}${deg}`,
          controller.name,
          `${watering.name} is due to run at ${when}, when it should be ${h.temp}${deg}. Skip it so paths don't ice over.`,
          watering.start,
        ),
      );
    else if (rules.sprinklerRain) {
      // The chance around the watering: three hours either side.
      const near = hours.filter((x) => {
        const t = hours.indexOf(x) - hours.indexOf(h);
        return t >= -3 && t <= 3;
      });
      const chance = Math.max(...near.map((x) => x.precip));
      if (chance >= 70)
        out.push(
          notice(
            `rain:${controller.id}:${watering.start}`,
            `Rain likely around the ${when} watering`,
            controller.name,
            `${chance}% chance of rain near ${watering.name} at ${when}. Skip it to save water.`,
            watering.start,
          ),
        );
    }
  }

  // A BC Hydro outage covering the home, with what the EcoFlow batteries have left.
  if (rules.outageBattery && inputs.ecoflow?.devices.length) {
    const outage = (inputs.area ?? []).find((a) => a.source === "power" && a.severity === "severe");
    const live = inputs.ecoflow.devices.filter((d) => d.online && d.soc !== undefined);
    if (outage && live.length) {
      const parts = live.map((d) => {
        const left =
          !d.charging && d.minutes ? `, about ${d.minutes >= 120 ? `${Math.round(d.minutes / 60)} h` : `${d.minutes} min`} left` : "";
        return `${d.name} ${d.soc}%${left}`;
      });
      const low = live.some((d) => (d.soc ?? 100) <= 20);
      out.push(
        notice(
          `outage:${outage.id}`,
          `Power's out: ${parts.join(" · ")}`,
          "Backup power",
          low ? "A battery is nearly empty. Keep it for the fridge and the internet." : "Running on the EcoFlow batteries.",
          outage.sent,
        ),
      );
    }
  }

  // Smoky or polluted air outside (Open-Meteo's AQHI), with the indoor PM2.5 from Airthings when there is one.
  if (rules.smokyAir && inputs.air && inputs.air.aqhi >= rules.smokyAqhi) {
    const indoor = (inputs.indoor?.devices ?? [])
      .filter((d) => d.recorded !== null && now - d.recorded < 3 * HOUR)
      .flatMap((d) => d.readings.filter((r) => r.kind === "pm25").map((r) => ({ d, r })));
    const worst = indoor.sort((a, b) => b.r.value - a.r.value)[0];
    const inside = worst ? ` Inside, ${worst.d.name} reads ${worst.r.value} ${worst.r.unit} PM2.5.` : "";
    const day = localDay(tz, now);
    out.push(
      notice(
        `smoke:${day}`,
        `Poor air outside (AQHI ${inputs.air.aqhi})`,
        config.location.name,
        `Keep windows shut and skip hard exercise outdoors.${inside}`,
        Date.parse(`${day}T00:00:00Z`),
      ),
    );
  }

  // A hard freeze tonight while the pool is still reporting (Blue Riiot): run the pump.
  if (rules.poolFreeze && inputs.pool?.pools.length && hours.length) {
    const coldest = hours.reduce((a, b) => (b.temp < a.temp ? b : a));
    if (coldest.temp <= hardFreezeAt(config.units)) {
      for (const p of inputs.pool.pools) {
        if (p.recorded === null || now - p.recorded > 24 * HOUR) continue;
        const water = p.readings.find((r) => r.kind === "temp");
        const day = coldest.time.slice(0, 10);
        out.push(
          notice(
            `poolFreeze:${p.id}:${day}`,
            `Freeze coming: ${coldest.temp}${deg} at the pool`,
            p.name,
            `${water ? `Water is ${water.value} ${water.unit}. ` : ""}Run the pump overnight so the lines don't freeze.`,
            Date.parse(`${day}T00:00:00Z`),
          ),
        );
      }
    }
  }

  // A washer or dryer that has sat done for a while (the "done" notice may already have been dismissed).
  if (rules.laundryWaiting && inputs.laundry) {
    for (const a of inputs.laundry.appliances) {
      if (a.state !== "done" || a.doneAt === undefined) continue;
      const mins = Math.floor((now - a.doneAt) / 60_000);
      if (mins < rules.laundryWaitMinutes) continue;
      const waited = mins >= 120 ? `${Math.floor(mins / 60)} h` : mins >= 60 ? `1 h ${mins - 60} min` : `${mins} min`;
      out.push(
        notice(
          `laundryWait:${a.id}`,
          `${a.name} has been done for ${waited}`,
          `finished ${time.format(a.doneAt)}`,
          a.kind === "dryer" ? "Empty it before the clothes wrinkle." : "Move the load before it starts to smell.",
          a.doneAt + 1,
        ),
      );
    }
  }

  // Bins out tonight: from `garbageHour` the evening before a pickup (Recycle Coach).
  if (rules.garbageEve && inputs.garbage?.configured) {
    const hour = Number(hourStamp(tz, now).slice(11, 13));
    const tomorrow = localDay(tz, now + 24 * HOUR);
    const pickup = inputs.garbage.pickups.find((p) => p.date === tomorrow);
    if (pickup && hour >= rules.garbageHour) {
      const bins = pickup.bins.map((b) => b.name);
      const list = bins.length > 1 ? `${bins.slice(0, -1).join(", ")} and ${bins.at(-1) ?? ""}` : (bins[0] ?? "Garbage");
      out.push(
        notice(
          `garbage:${tomorrow}`,
          `Bins out tonight: ${list}`,
          "Pickup tomorrow",
          "Put the carts at the curb before morning.",
          Date.parse(`${tomorrow}T00:00:00Z`),
        ),
      );
    }
  }

  return out;
}

/** Which feeds the switched-on rules need, so the server never calls a service no rule reads. */
export function rulesNeed(rules: AlertRules): Set<keyof RuleInputs> {
  const need = new Set<keyof RuleInputs>();
  if (rules.sprinklerFrost || rules.sprinklerRain) need.add("rachio").add("weather");
  if (rules.outageBattery) need.add("ecoflow").add("area");
  if (rules.smokyAir) need.add("air").add("indoor");
  if (rules.poolFreeze) need.add("pool").add("weather");
  if (rules.laundryWaiting) need.add("laundry");
  if (rules.garbageEve) need.add("garbage");
  return need;
}
