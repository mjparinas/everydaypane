import { describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import type { LaundryData } from "@/lib/display/types";
import { lgRegion, lgState, stState, type LaundryReading } from "@/lib/laundry";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { useTestServer } from "@/test/server";

import { advance, laundryAlerts, laundryFeed, settle, trimLgDevices, trimLgState, trimStLaundry, trimStStatus } from "./laundry";
import { setSecret } from "./secrets";

const NOW = Date.parse("2026-11-25T23:00:00Z");
const MIN = 60_000;

// Shapes from LG's ThinQ Connect reference (GET /devices, GET /devices/{id}/state) and its washer profile.
const lgDevices = [
  { deviceId: "abc-123", deviceInfo: { deviceType: "DEVICE_WASHER", alias: "Washer", modelName: "WM4000", reportable: true } },
  { deviceId: "def-456", deviceInfo: { deviceType: "DEVICE_DRYER", alias: " Dryer ", modelName: "DLEX4000" } },
  { deviceId: "fridge", deviceInfo: { deviceType: "DEVICE_REFRIGERATOR", alias: "Fridge" } },
  { deviceInfo: { deviceType: "DEVICE_WASHER" } },
];

describe("LG ThinQ", () => {
  it("keeps only laundry machines from the device list", () => {
    expect(trimLgDevices(lgDevices)).toEqual([
      { id: "abc-123", name: "Washer", kind: "washer", type: "DEVICE_WASHER" },
      { id: "def-456", name: "Dryer", kind: "dryer", type: "DEVICE_DRYER" },
    ]);
    expect(trimLgDevices(null)).toEqual([]);
  });

  it("reads a washer's state list, with time left", () => {
    const [washer] = trimLgDevices(lgDevices);
    const state = [
      {
        runState: { currentState: "RINSING" },
        location: { locationName: "MAIN" },
        remoteControlEnable: { remoteControlEnabled: false },
        timer: { remainHour: 0, remainMinute: 23, totalHour: 1, totalMinute: 10 },
      },
    ];
    expect(trimLgState(washer!, state)).toEqual([
      {
        id: "lg.abc_123",
        name: "Washer",
        kind: "washer",
        source: "lg",
        state: "running",
        phase: "Rinsing",
        remainingMin: 23,
        totalMin: 70,
      },
    ]);
  });

  it("splits a WashCombo's main and mini washers, and a WashTower's halves", () => {
    const combo = { id: "c1", name: "Combo", kind: "combo" as const, type: "DEVICE_WASHCOMBO_MAIN" };
    const parts = trimLgState(combo, [
      { runState: { currentState: "END" }, location: { locationName: "MAIN" } },
      { runState: { currentState: "POWER_OFF" }, location: { locationName: "MINI" } },
    ]);
    expect(parts.map((p) => [p.id, p.name, p.kind, p.state])).toEqual([
      ["lg.c1", "Combo", "combo", "done"],
      ["lg.c1_mini", "Combo (mini)", "washer", "off"],
    ]);
    const tower = trimLgState(
      { id: "t1", name: "Tower", kind: "washer", type: "DEVICE_WASHTOWER" },
      {
        washer: { runState: { currentState: "SPINNING" }, timer: { remainHour: 0, remainMinute: 5 } },
        dryer: { runState: { currentState: "PAUSE" }, timer: { remainHour: 1, remainMinute: 0 } },
      },
    );
    expect(tower.map((p) => [p.id, p.kind, p.state, p.remainingMin])).toEqual([
      ["lg.t1_washer", "washer", "running", 5],
      ["lg.t1_dryer", "dryer", "paused", 60],
    ]);
  });

  it("maps run states, treating unknown ones as running", () => {
    expect(lgState("END").state).toBe("done");
    expect(lgState("POWER_OFF").state).toBe("off");
    expect(lgState("INITIAL").state).toBe("idle");
    expect(lgState("PAUSE").state).toBe("paused");
    expect(lgState("ERROR").state).toBe("error");
    expect(lgState("SHOES_MODULE")).toEqual({ state: "running", phase: "Shoes module" });
  });

  it("picks LG's region from the country", () => {
    expect(lgRegion("CA")).toBe("aic");
    expect(lgRegion("us")).toBe("aic");
    expect(lgRegion("DE")).toBe("eic");
    expect(lgRegion("KR")).toBe("kic");
    expect(lgRegion("AU")).toBe("kic");
  });
});

// SmartThings shapes: /devices items and /devices/{id}/status (components.main.<capability>.<attribute>.value).
describe("SmartThings laundry", () => {
  const list = {
    items: [
      {
        deviceId: "w-1",
        label: "Samsung washer",
        components: [
          { id: "main", capabilities: [{ id: "switch" }, { id: "washerOperatingState" }, { id: "samsungce.washerOperatingState" }] },
        ],
      },
      { deviceId: "d-1", name: "[dryer] Samsung", components: [{ id: "main", capabilities: [], categories: [{ name: "Dryer" }] }] },
      { deviceId: "l-1", label: "Lamp", components: [{ id: "main", capabilities: [{ id: "switch" }] }] },
    ],
  };

  it("finds washers and dryers by capability or category", () => {
    expect(trimStLaundry(list)).toEqual([
      { id: "w-1", name: "Samsung washer", kind: "washer" },
      { id: "d-1", name: "[dryer] Samsung", kind: "dryer" },
    ]);
  });

  it("reads time left and progress from the samsungce capability", () => {
    const r = trimStStatus(
      { id: "w-1", name: "Samsung washer", kind: "washer" },
      {
        components: {
          main: {
            switch: { switch: { value: "on" } },
            washerOperatingState: {
              machineState: { value: "run" },
              washerJobState: { value: "rinse" },
              completionTime: { value: "2026-11-25T23:40:00Z" },
            },
            "samsungce.washerOperatingState": {
              operatingState: { value: "running" },
              remainingTime: { value: 30, unit: "min" },
              progress: { value: 50 },
            },
          },
        },
      },
      NOW,
    );
    expect(r).toMatchObject({ id: "smartthings.w_1", state: "running", phase: "Rinsing", remainingMin: 30, totalMin: 60 });
  });

  it("falls back to the completion time, and reads finish as done", () => {
    const dryer = { id: "d-1", name: "Dryer", kind: "dryer" as const };
    const running = trimStStatus(
      dryer,
      {
        components: {
          main: {
            dryerOperatingState: {
              machineState: { value: "run" },
              dryerJobState: { value: "drying" },
              completionTime: { value: "2026-11-25T23:45:00Z" },
            },
          },
        },
      },
      NOW,
    );
    expect(running).toMatchObject({ state: "running", phase: "Drying", endsAt: Date.parse("2026-11-25T23:45:00Z") });
    const done = trimStStatus(
      dryer,
      { components: { main: { dryerOperatingState: { machineState: { value: "stop" }, dryerJobState: { value: "finished" } } } } },
      NOW,
    );
    expect(done.state).toBe("done");
    expect(stState("stop", "none", "off").state).toBe("off");
    expect(stState("ready", "none", "on").state).toBe("idle");
  });
});

describe("cycles", () => {
  const reading = (state: LaundryReading["state"], extra: Partial<LaundryReading> = {}): LaundryReading => ({
    id: "lg.w",
    name: "Washer",
    kind: "washer",
    source: "lg",
    state,
    ...extra,
  });

  it("turns a run that stops into done, at its expected end when that has passed", () => {
    const run = advance(undefined, reading("running", { phase: "Washing", remainingMin: 20, totalMin: 60 }), NOW);
    expect(run.appliance).toMatchObject({ state: "running", endsAt: NOW + 20 * MIN, progress: 67 });
    expect(run.row).toEqual({ running: true, endsAt: NOW + 20 * MIN, doneAt: null });
    // No screen asked until 45 minutes later, by when the washer had powered off.
    const later = NOW + 45 * MIN;
    const off = advance(run.row, reading("off"), later);
    expect(off.appliance).toMatchObject({ state: "done", doneAt: NOW + 20 * MIN, rest: "off" });
    // It stays done on the next read, and goes back to off once the done window passes.
    const again = advance(off.row, reading("off"), later + MIN);
    expect(again.appliance.doneAt).toBe(NOW + 20 * MIN);
    expect(settle(again.appliance, 180, later + MIN).state).toBe("done");
    expect(settle(again.appliance, 20, later + MIN)).toEqual({ id: "lg.w", name: "Washer", kind: "washer", state: "off" });
  });

  it("keeps the first done time while the machine says END, and clears it when the next cycle starts", () => {
    const end = advance({ running: true, endsAt: NOW + 5 * MIN, doneAt: null }, reading("done"), NOW);
    expect(end.appliance).toMatchObject({ state: "done", doneAt: NOW });
    const still = advance(end.row, reading("done"), NOW + 10 * MIN);
    expect(still.appliance.doneAt).toBe(NOW);
    const next = advance(still.row, reading("running", { remainingMin: 50 }), NOW + 20 * MIN);
    expect(next.appliance.state).toBe("running");
    expect(next.row.doneAt).toBeNull();
  });

  it("never calls an idle machine that wasn't running done, nor an error", () => {
    expect(advance(undefined, reading("idle"), NOW).appliance.state).toBe("idle");
    expect(advance({ running: true, endsAt: null, doneAt: null }, reading("error"), NOW).appliance.state).toBe("error");
  });
});

describe("done notices", () => {
  const data: LaundryData = {
    updatedAt: NOW,
    configured: true,
    appliances: [
      { id: "lg.w", name: "Washer", kind: "washer", state: "done", doneAt: NOW - 10 * MIN },
      { id: "smartthings.d", name: "Dryer", kind: "dryer", state: "running", endsAt: NOW + 30 * MIN },
    ],
  };

  it("puts one blue, never-emailed notice per finished cycle on the strip", () => {
    const config = defaultConfig();
    const [alert, ...rest] = laundryAlerts(data, config);
    expect(rest).toEqual([]);
    expect(alert).toMatchObject({
      id: "laundry:lg.w",
      source: "laundry",
      severity: "minor",
      notice: true,
      title: "Washer is done",
      sent: NOW - 10 * MIN,
    });
    expect(alert?.area).toMatch(/^finished \d{1,2}:50/);
  });

  it("stays off the strip when switched off", () => {
    const config = defaultConfig();
    config.integrations.smartHome.laundry.alertDone = false;
    expect(laundryAlerts(data, config)).toEqual([]);
  });
});

describe("laundry feed", () => {
  useTestServer();

  it("reads LG with the SDK's headers and remembers a cycle across reads", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "lg.token", "pat_0123456789abcdef");
    const config = defaultConfig();
    let state = "RUNNING";
    const seen: Request[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const req = new Request(input as string, init);
      seen.push(req);
      const path = new URL(req.url).pathname;
      const response =
        path === "/devices"
          ? [{ deviceId: "abc-123", deviceInfo: { deviceType: "DEVICE_WASHER", alias: "Washer" } }]
          : [{ runState: { currentState: state }, location: { locationName: "MAIN" }, timer: { remainHour: 0, remainMinute: 10 } }];
      return new Response(JSON.stringify({ messageId: "x", timestamp: "t", response }), { status: 200 });
    });
    try {
      const first = await laundryFeed(LEGACY_ACCOUNT_ID, config, NOW);
      expect(first.appliances).toEqual([
        { id: "lg.abc_123", name: "Washer", kind: "washer", state: "running", phase: "Washing", endsAt: NOW + 10 * MIN },
      ]);
      const req = seen[0]!;
      expect(req.url).toBe("https://api-aic.lgthinq.com/devices");
      expect(req.headers.get("authorization")).toBe("Bearer pat_0123456789abcdef");
      expect(req.headers.get("x-country")).toBe("CA");
      expect(req.headers.get("x-service-phase")).toBe("OP");
      expect(req.headers.get("x-message-id")).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(req.headers.get("x-client-id")).toMatch(/^[0-9a-f-]{36}$/);
      // The washer powers off; a minute later (past the feed's cache) the wall says done.
      state = "POWER_OFF";
      const second = await laundryFeed(LEGACY_ACCOUNT_ID, config, NOW + 15 * MIN);
      expect(second.appliances[0]).toMatchObject({ state: "done", doneAt: NOW + 10 * MIN });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("says not configured with no LG token and no SmartThings", async () => {
    expect(await laundryFeed(LEGACY_ACCOUNT_ID, defaultConfig(), NOW)).toEqual({ updatedAt: NOW, configured: false, appliances: [] });
  });
});
