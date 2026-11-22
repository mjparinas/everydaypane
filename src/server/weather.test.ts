import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";

import { aqhi, forecastUrl, maxPollen, pollenUrl, trimAir, trimForecast } from "./weather";

const forecast = {
  current: { temperature_2m: 6.4, apparent_temperature: 3.2, weather_code: 61, is_day: 1, wind_speed_10m: 14.6, relative_humidity_2m: 88 },
  hourly: {
    time: ["2026-11-17T14:00", "2026-11-17T15:00"],
    temperature_2m: [6.4, 5.9],
    weather_code: [61, 3],
    precipitation_probability: [80, null],
    is_day: [1, 0],
  },
  daily: {
    time: ["2026-11-17", "2026-11-18"],
    weather_code: [63, 2],
    temperature_2m_max: [7.6, 9.2],
    temperature_2m_min: [3.1, 2.5],
    precipitation_probability_max: [90, 10],
    sunrise: ["2026-11-17T08:21", "2026-11-18T08:23"],
    sunset: ["2026-11-17T17:24", "2026-11-18T17:23"],
  },
};

describe("weather", () => {
  it("asks Open-Meteo for the dashboard's place, zone and units", () => {
    const c = defaultConfig();
    const metric = new URL(forecastUrl(c));
    expect(metric.searchParams.get("timezone")).toBe("America/Vancouver");
    expect(metric.searchParams.get("current")).toContain("uv_index");
    expect(metric.searchParams.get("daily")).toContain("uv_index_max");
    expect(metric.searchParams.get("temperature_unit")).toBeNull();
    expect(new URL(pollenUrl(c)).searchParams.get("current")).toBe(
      "alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
    );
    c.units = "imperial";
    expect(new URL(forecastUrl(c)).searchParams.get("temperature_unit")).toBe("fahrenheit");
  });

  it("trims the forecast to what the display draws, rounded", () => {
    const d = trimForecast(forecast, "metric", 1);
    expect(d.current).toEqual({ temp: 6, feels: 3, code: 61, isDay: true, wind: 15, humidity: 88 });
    expect(d.days[1]).toEqual({ date: "2026-11-18", code: 2, max: 9, min: 3, precip: 10 });
    expect(d.hours[1]).toEqual({ time: "2026-11-17T15:00", temp: 6, code: 3, precip: 0, isDay: false });
    expect(d.today).toEqual({ sunrise: "2026-11-17T08:21", sunset: "2026-11-17T17:24" });
    expect(d.units.temp).toBe("°C");
    expect(d.current.uv).toBeUndefined();
    expect(d.today.uvMax).toBeUndefined();
    expect(d.pollen).toBeUndefined();
  });

  it("keeps today's UV index when Open-Meteo sends one", () => {
    const withUv = {
      ...forecast,
      current: { ...forecast.current, uv_index: 2.6 },
      daily: { ...forecast.daily, uv_index_max: [4.4, null] },
    };
    const d = trimForecast(withUv, "metric", 1);
    expect(d.current.uv).toBe(3);
    expect(d.today.uvMax).toBe(4);
  });

  it("keeps the highest pollen count and ignores kinds that weren't reported", () => {
    expect(
      maxPollen({
        current: {
          alder_pollen: 1,
          birch_pollen: null,
          grass_pollen: 12.4,
          mugwort_pollen: 0,
          olive_pollen: 4,
          ragweed_pollen: 3,
        },
      }),
    ).toBe(12);
    expect(
      maxPollen({
        current: {
          alder_pollen: null,
          birch_pollen: null,
          grass_pollen: null,
          mugwort_pollen: null,
          olive_pollen: null,
          ragweed_pollen: null,
        },
      }),
    ).toBeUndefined();
    expect(maxPollen({})).toBeUndefined();
  });

  it("refuses a malformed answer rather than drawing junk", () => {
    expect(() => trimForecast({ current: {} }, "metric", 1)).toThrow();
  });
});

describe("air quality", () => {
  it("computes Canada's AQHI", () => {
    expect(aqhi(0, 0, 0)).toBe(1); // never below 1
    // A typical clean Lower Mainland day: NO2 15 µg/m³, O3 50 µg/m³, PM2.5 5 µg/m³ → low risk.
    expect(aqhi(15, 50, 5)).toBe(2);
    // Wildfire smoke: PM2.5 150 µg/m³ → high risk.
    expect(aqhi(20, 60, 150)).toBe(10);
  });

  it("averages the three hours up to now", () => {
    const raw = {
      current: { us_aqi: 42, pm2_5: 8.26 },
      hourly: {
        time: ["2026-11-17T10:00", "2026-11-17T11:00", "2026-11-17T12:00", "2026-11-17T13:00", "2026-11-17T14:00"],
        pm2_5: [500, 150, 150, 150, 500],
        ozone: [0, 60, 60, 60, 0],
        nitrogen_dioxide: [0, 20, 20, 20, 0],
      },
    };
    expect(trimAir(raw, 1, "2026-11-17T13:00")).toEqual({ updatedAt: 1, aqhi: 10, usAqi: 42, pm25: 8.3 });
  });
});
