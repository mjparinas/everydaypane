import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as haGET, POST as haPOST } from "@/app/api/display/ha/route";
import type { HaData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import {
  goveeAct,
  goveeCapability,
  goveeEntities,
  goveeEntity,
  parseGoveeDevices,
  resetGoveeForTests,
  stateEveryMs,
  type GoveeDevice,
} from "./govee";
import { resetHaForTests } from "./homeassistant";
import { setSecret } from "./secrets";
import { resetNativeForTests } from "./smartDevices";

const NOW = Date.parse("2026-11-21T20:00:00Z");

// The shape of Govee's GET /router/api/v1/user/devices, from developer.govee.com (this sandbox can't reach Govee).
const DEVICES = {
  code: 200,
  message: "success",
  data: [
    {
      sku: "H6008",
      device: "AB:CD:EF:01:23:45:67:89",
      deviceName: "Kitchen bulb",
      type: "devices.types.light",
      capabilities: [
        { type: "devices.capabilities.on_off", instance: "powerSwitch", parameters: { dataType: "ENUM", options: [] } },
        {
          type: "devices.capabilities.range",
          instance: "brightness",
          parameters: { dataType: "INTEGER", range: { min: 1, max: 100, precision: 1 } },
        },
        {
          type: "devices.capabilities.color_setting",
          instance: "colorRgb",
          parameters: { dataType: "INTEGER", range: { min: 0, max: 16777215, precision: 1 } },
        },
        {
          type: "devices.capabilities.dynamic_scene",
          instance: "lightScene",
          parameters: { dataType: "ENUM", options: [{ name: "Tudum", value: 3054 }] },
        },
      ],
    },
    {
      sku: "H5080",
      device: "11:22:33:44:55:66:77:88",
      deviceName: "Fan plug",
      capabilities: [{ type: "devices.capabilities.on_off", instance: "powerSwitch" }],
    },
    { sku: "", device: "broken" },
  ],
};

const STATE_ON = {
  code: 200,
  msg: "success",
  payload: {
    sku: "H6008",
    device: "AB:CD:EF:01:23:45:67:89",
    capabilities: [
      { type: "devices.capabilities.online", instance: "online", state: { value: true } },
      { type: "devices.capabilities.on_off", instance: "powerSwitch", state: { value: 1 } },
      { type: "devices.capabilities.range", instance: "brightness", state: { value: 50 } },
      { type: "devices.capabilities.color_setting", instance: "colorRgb", state: { value: 0xff0000 } },
    ],
  },
};

const SCENES = {
  code: 200,
  payload: {
    capabilities: [
      {
        type: "devices.capabilities.dynamic_scene",
        instance: "lightScene",
        parameters: { dataType: "ENUM", options: [{ name: "Sunrise", value: { paramId: 4280, id: 3853 } }] },
      },
    ],
  },
};

const bulb = (): GoveeDevice => {
  const d = parseGoveeDevices(DEVICES)[0];
  if (!d) throw new Error("no bulb");
  return d;
};

describe("Govee shapes", () => {
  it("lists devices with what each can do and skips broken entries", () => {
    const devices = parseGoveeDevices(DEVICES);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      id: "govee.h6008_ab_cd_ef_01_23_45_67_89",
      name: "Kitchen bulb",
      power: true,
      brightness: { min: 1, max: 100 },
      color: true,
      scenes: true,
      staticScenes: { Tudum: 3054 },
    });
    expect(devices[1]).toMatchObject({ name: "Fan plug", power: true, color: false, scenes: false, brightness: undefined });
    expect(parseGoveeDevices({ code: 401 })).toEqual([]);
  });

  it("reads a light's state, and an offline light as unavailable", () => {
    expect(goveeEntity(bulb(), STATE_ON, NOW, ["Sunrise"])).toMatchObject({
      state: "on",
      brightness: 128,
      color: "#ff0000",
      scenes: ["Sunrise"],
    });
    const offline = structuredClone(STATE_ON);
    offline.payload.capabilities[0] = { type: "devices.capabilities.online", instance: "online", state: { value: false } };
    expect(goveeEntity(bulb(), offline, NOW).state).toBe("unavailable");
  });

  it("turns taps into Govee capabilities, and refuses what the light can't do", () => {
    const d = bulb();
    const on = goveeEntity(d, STATE_ON, NOW);
    expect(goveeCapability(d, { action: "toggle" }, on)).toEqual({
      type: "devices.capabilities.on_off",
      instance: "powerSwitch",
      value: 0,
    });
    expect(goveeCapability(d, { action: "brightness", value: 250 }, on)?.value).toBe(100);
    expect(goveeCapability(d, { action: "color", value: 0x00ff00 }, on)).toEqual({
      type: "devices.capabilities.color_setting",
      instance: "colorRgb",
      value: 0x00ff00,
    });
    expect(goveeCapability(d, { action: "color", value: 0x1000000 }, on)).toBeNull();
    expect(goveeCapability(d, { action: "scene", option: "Sunrise" }, on, { Sunrise: { paramId: 4280, id: 3853 } })?.value).toEqual({
      paramId: 4280,
      id: 3853,
    });
    expect(goveeCapability(d, { action: "scene", option: "Made up" }, on, { Sunrise: 1 })).toBeNull();
    const plug = parseGoveeDevices(DEVICES)[1];
    if (!plug) throw new Error("no plug");
    expect(goveeCapability(plug, { action: "color", value: 0 }, undefined)).toBeNull();
  });

  it("reads each light less often when many share the day's budget", () => {
    expect(stateEveryMs(1)).toBe(60_000);
    expect(stateEveryMs(4)).toBe(60_000);
    // Sixteen lights at one read every ~3.8 minutes is about 6,000 reads a day.
    expect(stateEveryMs(16)).toBe(230_400);
    expect((16 * 86_400_000) / stateEveryMs(16)).toBeLessThanOrEqual(6000);
  });
});

describe("Govee over the network", () => {
  useTestServer();
  const calls: { url: string; body: unknown; key: string | null }[] = [];

  beforeEach(async () => {
    clearMemoryCache();
    resetGoveeForTests();
    calls.length = 0;
    await setSecret(LEGACY_ACCOUNT_ID, "govee.apiKey", "test-govee-key");
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      calls.push({ url, body, key: new Headers(init.headers).get("Govee-API-Key") });
      if (url.endsWith("/user/devices")) return Promise.resolve(Response.json(DEVICES));
      if (url.endsWith("/device/state")) return Promise.resolve(Response.json(STATE_ON));
      if (url.endsWith("/device/scenes")) return Promise.resolve(Response.json(SCENES));
      if (url.endsWith("/device/control")) return Promise.resolve(Response.json({ code: 200, msg: "success" }));
      return Promise.resolve(new Response("", { status: 404 }));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const id = "govee.h6008_ab_cd_ef_01_23_45_67_89";

  it("reads only lights on widgets, with the key in Govee's header, and keeps states between polls", async () => {
    const first = await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW);
    expect(first[id]).toMatchObject({ state: "on", color: "#ff0000", scenes: ["Tudum", "Sunrise"] });
    expect(Object.keys(first)).toEqual([id]);
    expect(calls.every((c) => c.key === "test-govee-key")).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/device/state"))).toHaveLength(1);

    // Five seconds later the display polls again: no new state read.
    await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW + 5000);
    expect(calls.filter((c) => c.url.endsWith("/device/state"))).toHaveLength(1);
    await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW + 61_000);
    expect(calls.filter((c) => c.url.endsWith("/device/state"))).toHaveLength(2);
  });

  it("sends a scene by name and shows a tap at once", async () => {
    await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW);
    expect(await goveeAct(LEGACY_ACCOUNT_ID, id, { action: "scene", option: "Sunrise" }, NOW + 1000)).toBe("ok");
    const control = calls.find((c) => c.url.endsWith("/device/control"));
    expect(control?.body).toMatchObject({
      payload: {
        sku: "H6008",
        device: "AB:CD:EF:01:23:45:67:89",
        capability: { type: "devices.capabilities.dynamic_scene", instance: "lightScene", value: { paramId: 4280, id: 3853 } },
      },
    });

    expect(await goveeAct(LEGACY_ACCOUNT_ID, id, { action: "off" }, NOW + 2000)).toBe("ok");
    const after = await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW + 3000);
    expect(after[id]?.state).toBe("off");
    expect(calls.filter((c) => c.url.endsWith("/device/state"))).toHaveLength(1);
  });

  it("refuses a device the account doesn't have", async () => {
    expect(await goveeAct(LEGACY_ACCOUNT_ID, "govee.h6008_somebody_else", { action: "on" }, NOW)).toBe("forbidden");
    expect(calls.some((c) => c.url.endsWith("/device/control"))).toBe(false);
  });

  it("reaches the wall through the Smart device feed, and only for lights on a widget", async () => {
    resetHaForTests();
    resetNativeForTests();
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [
      { id: "g1", type: "haEntity", provider: "govee", x: 0, y: 0, w: 2, h: 2, showBackground: true, entityId: id, control: "light" },
    ];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    const token = (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
    const headers = { "x-display-token": token };

    const data = (await (await haGET(req("/api/display/ha/", { headers }))).json()) as HaData;
    expect(data.configured).toBe(true);
    expect(Object.keys(data.entities)).toEqual([id]);

    const tap = (entity: string, action: string, extra: Record<string, unknown> = {}) =>
      haPOST(req("/api/display/ha/", { method: "POST", headers, body: JSON.stringify({ entity, action, ...extra }) }));
    expect((await tap(id, "color", { value: 0x0a84ff })).status).toBe(200);
    expect((await tap(id, "scene", { option: "Tudum" })).status).toBe(200);
    expect((await tap("govee.h5080_11_22_33_44_55_66_77_88", "on")).status).toBe(403);
    const sent = calls
      .filter((c) => c.url.endsWith("/device/control"))
      .map((c) => (c.body as { payload: { capability: unknown } }).payload.capability);
    expect(sent).toEqual([
      { type: "devices.capabilities.color_setting", instance: "colorRgb", value: 0x0a84ff },
      { type: "devices.capabilities.dynamic_scene", instance: "lightScene", value: 3054 },
    ]);
  });

  it("shows nothing without a key", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "govee.apiKey", null);
    expect(await goveeEntities(LEGACY_ACCOUNT_ID, new Set([id]), NOW)).toEqual({});
  });
});
