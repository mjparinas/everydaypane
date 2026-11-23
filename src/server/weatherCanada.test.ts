import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { canadaCitiesUrl, canadaCityUrl, ecIconToWmo, nearestCanadaCity, trimCanada } from "./weatherCanada";

const here = dirname(fileURLToPath(import.meta.url));
const langley = JSON.parse(readFileSync(join(here, "fixtures/ec-langley.json"), "utf8")) as unknown;
const cities = JSON.parse(readFileSync(join(here, "fixtures/ec-cities.json"), "utf8")) as unknown;

describe("Environment Canada weather", () => {
  it("maps city-page icon codes onto the wall's WMO-ish set", () => {
    expect(ecIconToWmo(0)).toBe(0);
    expect(ecIconToWmo(3)).toBe(3);
    expect(ecIconToWmo(12)).toBe(61);
    expect(ecIconToWmo(16)).toBe(71);
    expect(ecIconToWmo(19)).toBe(95);
    expect(ecIconToWmo(33)).toBe(3); // night mostly-cloudy
    expect(ecIconToWmo("12")).toBe(61);
  });

  it("builds GeoMet list and item addresses", () => {
    const list = canadaCitiesUrl(49.1, -122.66);
    expect(list).toContain("bbox=-123.4600,48.3000,-121.8600,49.9000");
    expect(canadaCityUrl("bc-100")).toBe("https://api.weather.gc.ca/collections/citypageweather-realtime/items/bc-100?f=json&lang=en");
  });

  it("picks the nearest city page within range", () => {
    const near = nearestCanadaCity(cities, 49.1044, -122.6604);
    expect(near?.id).toBe("bc-100");
    expect(near?.name).toBe("Langley");
    expect(nearestCanadaCity(cities, 0, 0)).toBeNull();
  });

  it("trims a Langley city page into the display weather shape", () => {
    const d = trimCanada(langley, "metric", "America/Vancouver", Date.parse("2026-11-23T21:30:00Z"));
    expect(d.current.temp).toBe(10);
    expect(d.current.code).toBe(3);
    expect(d.current.humidity).toBe(65);
    expect(d.current.wind).toBe(9);
    expect(d.hours).toHaveLength(3);
    expect(d.hours[0]?.precip).toBe(40);
    expect(d.hours[0]?.code).toBe(61);
    expect(d.days.length).toBeGreaterThanOrEqual(2);
    expect(d.days[0]?.max).toBe(10);
    expect(d.days[0]?.min).toBe(7);
    expect(d.today.sunrise).toMatch(/^2026-11-23T/);
    expect(d.units.temp).toBe("°C");
  });

  it("converts to imperial when the household asks", () => {
    const d = trimCanada(langley, "imperial", "America/Vancouver", Date.parse("2026-11-23T21:30:00Z"));
    expect(d.units).toEqual({ temp: "°F", wind: "mph" });
    expect(d.current.temp).toBe(49); // 9.6 °C
  });
});
