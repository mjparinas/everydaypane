import { describe, expect, it } from "vitest";

import { evaluateRules, RULES_DEFAULT, rulesNeed } from "./alertRules";
import { defaultConfig } from "./config/defaults";
import { configSchema, type DashboardConfig } from "./config/schema";
import type { EmergencyAlert, RachioData, WeatherData, WeatherHour } from "./display/types";

// Langley is on UTC−7 all year from 2026: 8 PM on Thursday 26 November is 03:00 UTC on the 27th.
const NOW = Date.UTC(2026, 10, 27, 3);
const HOUR = 3_600_000;

function config(rules: Partial<DashboardConfig["alerts"]["rules"]> = {}): DashboardConfig {
  const c = defaultConfig();
  c.alerts.rules = { ...RULES_DEFAULT, ...rules };
  return c;
}

/** 24 hourly stamps from 8 PM tonight, local time, all at `temp` unless `at` says otherwise. */
function forecast(temp: number, at: Record<string, Partial<WeatherHour>> = {}): WeatherData {
  const hours: WeatherHour[] = [];
  for (let i = 0; i < 24; i++) {
    const h = (20 + i) % 24;
    const day = 20 + i < 24 ? "26" : "27";
    const time = `2026-11-${day}T${String(h).padStart(2, "0")}:00`;
    hours.push({ time, temp, code: 3, precip: 10, isDay: false, ...at[time] });
  }
  return {
    updatedAt: NOW,
    units: { temp: "°C", wind: "km/h" },
    current: { temp, feels: temp, code: 3, isDay: false, wind: 5, humidity: 80 },
    today: { sunrise: "", sunset: "" },
    hours,
    days: [],
  };
}

// 6 AM tomorrow, local.
const SIX_AM = Date.UTC(2026, 10, 27, 13);
const rachio: RachioData = {
  updatedAt: NOW,
  configured: true,
  controllers: [
    {
      id: "c1",
      name: "Front yard",
      online: true,
      rainDelayUntil: null,
      next: { start: SIX_AM, name: "Lawn mornings", minutes: 20, zones: [] },
    },
  ],
};

describe("smart notices", () => {
  it("loads an older document without rules, with the defaults", () => {
    const raw = structuredClone(defaultConfig()) as unknown as { alerts: Record<string, unknown> };
    delete raw.alerts.rules;
    expect(configSchema.parse(raw).alerts.rules).toEqual(RULES_DEFAULT);
  });

  it("warns about a watering into frost", () => {
    const out = evaluateRules(config(), { rachio, weather: forecast(4, { "2026-11-27T06:00": { temp: -1 } }) }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "smart", notice: true, area: "Front yard", sent: SIX_AM });
    expect(out[0]?.title).toBe("Sprinklers at 6:00 a.m. in -1°C");
  });

  it("stays quiet when it's mild, when the watering is days away, or under a rain delay", () => {
    expect(evaluateRules(config(), { rachio, weather: forecast(6) }, NOW)).toEqual([]);
    const far = structuredClone(rachio);
    far.controllers[0]!.next!.start = NOW + 30 * HOUR;
    expect(evaluateRules(config(), { rachio: far, weather: forecast(-3) }, NOW)).toEqual([]);
    const delayed = structuredClone(rachio);
    delayed.controllers[0]!.rainDelayUntil = SIX_AM + HOUR;
    expect(evaluateRules(config(), { rachio: delayed, weather: forecast(-3) }, NOW)).toEqual([]);
  });

  it("says rain is likely only when that rule is on", () => {
    const wet = forecast(8, { "2026-11-27T08:00": { precip: 85 } });
    expect(evaluateRules(config(), { rachio, weather: wet }, NOW)).toEqual([]);
    const [n] = evaluateRules(config({ sprinklerRain: true }), { rachio, weather: wet }, NOW);
    expect(n?.title).toBe("Rain likely around the 6:00 a.m. watering");
    expect(n?.description).toContain("85%");
  });

  it("gives the EcoFlow batteries' charge during an outage covering the home", () => {
    const outage: EmergencyAlert = {
      id: "bchydro:1",
      source: "power",
      severity: "severe",
      title: "Power outage here",
      area: "Walnut Grove",
      description: "",
      sent: NOW - HOUR,
      expires: null,
    };
    const ecoflow = {
      updatedAt: NOW,
      configured: true,
      devices: [
        { sn: "a", name: "Delta Pro", online: true, soc: 64, charging: false, minutes: 300 },
        { sn: "b", name: "River", online: false, charging: false },
      ],
    };
    const [n] = evaluateRules(config(), { area: [outage], ecoflow }, NOW);
    expect(n?.title).toBe("Power's out: Delta Pro 64%, about 5 h left");
    expect(n?.id).toBe("rule:outage:bchydro:1");
    // An outage nearby (moderate) isn't one at home.
    expect(evaluateRules(config(), { area: [{ ...outage, severity: "moderate" }], ecoflow }, NOW)).toEqual([]);
  });

  it("flags poor air outside with the worst fresh indoor PM2.5", () => {
    const air = { updatedAt: NOW, aqhi: 8, usAqi: 160, pm25: 70 };
    const indoor = {
      updatedAt: NOW,
      configured: true,
      devices: [
        {
          serial: "1",
          name: "Kitchen",
          recorded: NOW - HOUR,
          readings: [{ kind: "pm25" as const, value: 12, unit: "µg/m³", level: "fair" as const }],
        },
        {
          serial: "2",
          name: "Old",
          recorded: NOW - 10 * HOUR,
          readings: [{ kind: "pm25" as const, value: 40, unit: "µg/m³", level: "poor" as const }],
        },
      ],
    };
    const [n] = evaluateRules(config(), { air, indoor }, NOW);
    expect(n?.title).toBe("Poor air outside (AQHI 8)");
    expect(n?.description).toContain("Kitchen reads 12 µg/m³");
    expect(n?.id).toBe("rule:smoke:2026-11-26");
    expect(evaluateRules(config(), { air: { ...air, aqhi: 6 } }, NOW)).toEqual([]);
  });

  it("warns of a hard freeze at a pool that's still reporting", () => {
    const pool = {
      updatedAt: NOW,
      configured: true,
      pools: [
        {
          id: "p",
          name: "Backyard pool",
          recorded: NOW - HOUR,
          readings: [{ kind: "temp" as const, value: 9, unit: "°C", level: "ok" as const }],
        },
      ],
    };
    const cold = forecast(0, { "2026-11-27T05:00": { temp: -4 } });
    expect(evaluateRules(config(), { pool, weather: cold }, NOW)).toEqual([]);
    const [n] = evaluateRules(config({ poolFreeze: true }), { pool, weather: cold }, NOW);
    expect(n?.title).toBe("Freeze coming: -4°C at the pool");
    expect(n?.description).toContain("Water is 9 °C");
  });

  it("reminds about a load left sitting once it has waited long enough", () => {
    const laundry = {
      updatedAt: NOW,
      configured: true,
      appliances: [{ id: "d", name: "Dryer", kind: "dryer" as const, state: "done" as const, doneAt: NOW - 75 * 60_000 }],
    };
    const on = config({ laundryWaiting: true });
    expect(evaluateRules(on, { laundry }, NOW)[0]?.title).toBe("Dryer has been done for 1 h 15 min");
    expect(evaluateRules(config({ laundryWaiting: true, laundryWaitMinutes: 90 }), { laundry }, NOW)).toEqual([]);
    expect(evaluateRules(config(), { laundry }, NOW)).toEqual([]);
  });

  it("says which bins go out the evening before pickup, from the chosen hour", () => {
    const garbage = {
      updatedAt: NOW,
      configured: true,
      pickups: [
        {
          date: "2026-11-27",
          bins: [
            { name: "Garbage", kind: "garbage" as const },
            { name: "Recycling", kind: "recycling" as const },
            { name: "Green", kind: "organics" as const },
          ],
        },
      ],
    } as Parameters<typeof evaluateRules>[1]["garbage"];
    const [n] = evaluateRules(config({ garbageEve: true }), { garbage }, NOW);
    expect(n?.title).toBe("Bins out tonight: Garbage, Recycling and Green");
    expect(evaluateRules(config({ garbageEve: true, garbageHour: 21 }), { garbage }, NOW)).toEqual([]);
  });

  it("asks only for the feeds the switched-on rules read", () => {
    const off = { ...RULES_DEFAULT, sprinklerFrost: false, outageBattery: false, smokyAir: false };
    expect([...rulesNeed(off)]).toEqual([]);
    expect([...rulesNeed({ ...off, garbageEve: true })]).toEqual(["garbage"]);
  });
});
