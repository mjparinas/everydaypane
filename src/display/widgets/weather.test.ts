// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { WeatherData } from "@/lib/display/types";

import { weatherNotes } from "./weather";

const data = {
  updatedAt: 1,
  units: { temp: "°C", wind: "km/h" },
  current: { temp: 6, feels: 3, code: 3, isDay: true, wind: 10, humidity: 80, uv: 2 },
  today: { sunrise: "2026-11-22T07:30", sunset: "2026-11-22T16:30", uvMax: 4 },
  pollen: 12,
  hours: [],
  days: [],
} satisfies WeatherData;

describe("weather notes", () => {
  it("shows the UV index and the day's peak, and the highest pollen count", () => {
    expect(weatherNotes(data, true, true)).toBe("UV 2 · low · peaks at 4 · Pollen 12 · low");
    expect(weatherNotes(data, true, false)).toBe("UV 2 · low · peaks at 4");
    expect(weatherNotes(data, false, true)).toBe("Pollen 12 · low");
    expect(weatherNotes({ ...data, pollen: 0 }, false, true)).toBe("No pollen");
    expect(weatherNotes(data, false, false)).toBe("");
  });

  it("leaves a line off when the forecast didn't include it", () => {
    const bare: WeatherData = {
      ...data,
      current: { ...data.current, uv: undefined },
      today: { sunrise: data.today.sunrise, sunset: data.today.sunset },
      pollen: undefined,
    };
    expect(weatherNotes(bare, true, true)).toBe("");
  });
});
