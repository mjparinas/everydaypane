import { describe, expect, it } from "vitest";

import { airLevel } from "@/lib/airthings";
import { defaultConfig } from "@/lib/config/defaults";
import type { AirthingsData } from "@/lib/display/types";

import { indoorAlerts, parseRecorded, trimDevices, trimSensors } from "./airthings";

// Shapes from the consumer API (consumer-api.airthings.com/v1), as Airthings documents them.
const sensors = {
  results: [
    {
      serialNumber: "2960000001",
      recorded: "2026-11-21T15:00:00",
      batteryPercentage: 87,
      sensors: [
        { sensorType: "radonShortTermAvg", value: 182, unit: "bq" },
        { sensorType: "co2", value: 1210.4, unit: "ppm" },
        { sensorType: "voc", value: 140, unit: "ppb" },
        { sensorType: "humidity", value: 41.6, unit: "pct" },
        { sensorType: "temp", value: 21.25, unit: "c" },
        { sensorType: "pressure", value: 1013, unit: "mbar" },
      ],
    },
    { serialNumber: "2950000002", recorded: "2026-11-21T14:00:00", sensors: [{ sensorType: "radonShortTermAvg", value: 40 }] },
    { sensors: [{ sensorType: "co2", value: 500 }] },
  ],
  hasNext: false,
  totalPages: 1,
};
const names = new Map([
  ["2960000001", "Kitchen"],
  ["2950000002", "Basement"],
]);

describe("Airthings levels", () => {
  it("uses Airthings' own bands", () => {
    expect(airLevel("radon", 99)).toBe("good");
    expect(airLevel("radon", 100)).toBe("fair");
    expect(airLevel("radon", 150)).toBe("poor");
    expect(airLevel("co2", 799)).toBe("good");
    expect(airLevel("co2", 1000)).toBe("poor");
    expect(airLevel("humidity", 45)).toBe("good");
    expect(airLevel("humidity", 27)).toBe("fair");
    expect(airLevel("humidity", 75)).toBe("poor");
    expect(airLevel("temp", 16)).toBe("fair");
  });
});

describe("Airthings trim", () => {
  it("keeps the readings we show, named and levelled, in metric", () => {
    const [kitchen, basement, ...rest] = trimSensors(sensors, names, "metric");
    expect(rest).toEqual([]);
    expect(kitchen).toEqual({
      serial: "2960000001",
      name: "Kitchen",
      recorded: Date.UTC(2026, 10, 21, 15),
      battery: 87,
      readings: [
        { kind: "radon", value: 182, unit: "Bq/m³", level: "poor" },
        { kind: "co2", value: 1210, unit: "ppm", level: "poor" },
        { kind: "voc", value: 140, unit: "ppb", level: "good" },
        { kind: "humidity", value: 42, unit: "%", level: "good" },
        { kind: "temp", value: 21.3, unit: "°C", level: "good" },
      ],
    });
    expect(basement?.readings).toEqual([{ kind: "radon", value: 40, unit: "Bq/m³", level: "good" }]);
  });

  it("converts radon to pCi/L and temperature to °F for imperial, keeping the metric level", () => {
    const [kitchen] = trimSensors(sensors, names, "imperial");
    expect(kitchen?.readings.find((r) => r.kind === "radon")).toEqual({ kind: "radon", value: 4.9, unit: "pCi/L", level: "poor" });
    expect(kitchen?.readings.find((r) => r.kind === "temp")).toEqual({ kind: "temp", value: 70.3, unit: "°F", level: "good" });
  });

  it("reads devices and zone-less times as UTC", () => {
    expect(trimDevices({ devices: [{ serialNumber: "1", name: " Den ", type: "WAVE_PLUS" }, { name: "no serial" }] })).toEqual([
      { serial: "1", name: "Den", type: "WAVE_PLUS" },
    ]);
    expect(parseRecorded("2026-11-21T15:00:00")).toBe(Date.UTC(2026, 10, 21, 15));
    expect(parseRecorded("2026-11-21T15:00:00Z")).toBe(Date.UTC(2026, 10, 21, 15));
    expect(parseRecorded("nope")).toBeNull();
    expect(parseRecorded(undefined)).toBeNull();
  });
});

describe("Airthings alerts", () => {
  const now = Date.UTC(2026, 10, 21, 16);
  const data: AirthingsData = { updatedAt: now, configured: true, devices: trimSensors(sensors, names, "metric") };
  const withAlerts = (alertRadon: boolean, alertCo2: boolean, co2Ppm = 1500) => {
    const c = defaultConfig();
    c.integrations.smartHome.airthings = { alertRadon, alertCo2, co2Ppm };
    return c;
  };

  it("raises nothing unless switched on", () => {
    expect(indoorAlerts(data, withAlerts(false, false), now)).toEqual([]);
  });

  it("raises high radon and CO₂ over the chosen level, one id per device and day", () => {
    expect(indoorAlerts(data, withAlerts(true, false), now).map((a) => [a.id, a.severity, a.title])).toEqual([
      ["airthings:radon:2960000001:2026-11-21", "moderate", "High radon: Kitchen"],
    ]);
    expect(indoorAlerts(data, withAlerts(false, true), now)).toEqual([]);
    expect(indoorAlerts(data, withAlerts(false, true, 1200), now).map((a) => a.id)).toEqual(["airthings:co2:2960000001:2026-11-21"]);
  });

  it("ignores readings older than six hours", () => {
    expect(indoorAlerts(data, withAlerts(true, true, 800), now + 7 * 3_600_000)).toEqual([]);
  });
});
