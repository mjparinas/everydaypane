import { describe, expect, it } from "vitest";

import { iwlsCode, labelHiLo, matchIwlsStations, parseIwlsReadings, resample, trimIwlsStations, trimNoaaStations } from "./tides";

describe("tide stations", () => {
  it("trims NOAA station search results", () => {
    expect(
      trimNoaaStations({
        stations: [
          { id: "9447130", name: "Seattle", state: "WA" },
          { id: "9414290", name: "San Francisco", state: "CA" },
        ],
      }),
    ).toEqual([
      { id: "9447130", name: "Seattle", region: "WA" },
      { id: "9414290", name: "San Francisco", region: "CA" },
    ]);
  });
});

describe("Canadian tides", () => {
  it("uses five-digit station numbers, fixing the old Point Atkinson default", () => {
    expect(iwlsCode("iwls:7577")).toBe("07577");
    expect(iwlsCode("iwls:07795")).toBe("07795");
    expect(iwlsCode("iwls:8320")).toBe("07795");
    expect(iwlsCode("iwls:5cebf1de3d0f4a073c4bb94e")).toBe("5cebf1de3d0f4a073c4bb94e");
  });

  it("reads IWLS's bare list of readings and tells highs from lows", () => {
    const readings = parseIwlsReadings([
      { eventDate: "2026-11-26T06:12:00Z", qcFlagCode: "1", value: 4.31, timeSeriesId: "x" },
      { eventDate: "2026-11-26T00:05:00Z", qcFlagCode: "1", value: 1.02, timeSeriesId: "x" },
      { eventDate: "2026-11-26T12:40:00Z", qcFlagCode: "1", value: 2.2, timeSeriesId: "x" },
      { eventDate: "2026-11-26T17:50:00Z", qcFlagCode: "1", value: 3.9, timeSeriesId: "x" },
    ]);
    expect(labelHiLo(readings).map((e) => `${e.time.slice(11, 16)} ${e.type} ${e.height}`)).toEqual([
      "00:05 low 1.02",
      "06:12 high 4.31",
      "12:40 low 2.2",
      "17:50 high 3.9",
    ]);
    expect(parseIwlsReadings({ series: [{ eventDate: "2026-11-26T00:05:00Z", value: 1 }] })).toHaveLength(1);
    expect(parseIwlsReadings({ message: "nope" })).toEqual([]);
  });

  it("resamples readings to every half hour", () => {
    const t0 = Date.UTC(2026, 10, 26, 0);
    const readings: [number, number][] = Array.from({ length: 100 }, (_, i) => [t0 + i * 15 * 60_000, i / 4]);
    const out = resample(readings, t0 + 7 * 60_000);
    expect(out).toHaveLength(49);
    expect(out[0]).toBeCloseTo(0.12, 2);
    expect(out[2]).toBeCloseTo(1.12, 2);
    expect(resample(readings.slice(0, 10), t0)).toHaveLength(5);
  });

  it("finds Canadian stations by name", () => {
    const all = trimIwlsStations([
      { id: "a", code: "07577", officialName: "White Rock", latitude: 49.02, longitude: -122.8, timeSeries: [{ code: "wlp-hilo" }] },
      { id: "b", code: "07579", officialName: "Crescent Beach", latitude: 49.04, longitude: -122.88, timeSeries: [{ code: "wlp-hilo" }] },
      { id: "c", code: "07795", officialName: "Point Atkinson", latitude: 49.34, longitude: -123.25 },
      { id: "d", code: "08000", officialName: "Water level only", timeSeries: [{ code: "wlo" }] },
    ]);
    expect(all.map((s) => s.id)).toEqual(["iwls:07577", "iwls:07579", "iwls:07795"]);
    expect(matchIwlsStations(all, "white")).toEqual([
      { id: "iwls:07577", label: "White Rock (07577)", latitude: 49.02, longitude: -122.8 },
    ]);
    expect(matchIwlsStations(all, "point atk").map((s) => s.id)).toEqual(["iwls:07795"]);
  });
});
