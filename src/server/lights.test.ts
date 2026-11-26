import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as haGET, POST as haPOST } from "@/app/api/display/ha/route";
import type { HaData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { resetHaForTests } from "./homeassistant";
import { hueAct, hueBody, hueEntities, parseHueLights, resetHueForTests } from "./hue";
import { lifxAct, lifxBody, lifxEntities, parseLifxLights, resetLifxForTests } from "./lifx";
import { getSecret, setSecret } from "./secrets";
import { resetNativeForTests } from "./smartDevices";
import { resetSmartHomeAuthForTests } from "./smartHomeAuth";

const NOW = Date.parse("2026-11-25T20:00:00Z");

// Philips Hue CLIP v2 `GET /resource/light`, shaped as developers.meethue.com documents it (this sandbox can't reach Hue).
const HUE_LIGHTS = {
  errors: [],
  data: [
    {
      id: "3f1c2a8e-0c3d-4c5e-9b1a-2f6d7e8a9b01",
      type: "light",
      metadata: { name: "Kitchen pendant", archetype: "pendant_round" },
      on: { on: true },
      dimming: { brightness: 50, min_dim_level: 0.2 },
      color: { xy: { x: 0.64, y: 0.33 }, gamut_type: "C" },
    },
    { id: "9a8b7c6d-1111-2222-3333-444455556666", type: "light", metadata: { name: "Porch" }, on: { on: false } },
    { id: 42, type: "light" },
  ],
};

// LIFX `GET /v1/lights/all`, from api.developer.lifx.com (this sandbox can't reach LIFX).
const LIFX_LIGHTS = [
  {
    id: "d073d5000001",
    uuid: "8fa5f072-af97-44ed-ae54-e9abc1234567",
    label: "Living room",
    connected: true,
    power: "on",
    color: { hue: 240, saturation: 1, kelvin: 3500 },
    brightness: 0.25,
    product: { name: "LIFX Color", capabilities: { has_color: true, has_variable_color_temp: true } },
  },
  {
    id: "d073d5000002",
    label: "Hall",
    connected: false,
    power: "off",
    brightness: 1,
    product: { capabilities: { has_color: false } },
  },
  { id: "../bad", label: "Nope" },
];

const hueId = "hue.3f1c2a8e_0c3d_4c5e_9b1a_2f6d7e8a9b01";
const lifxId = "lifx.d073d5000001";

describe("Hue and LIFX shapes", () => {
  it("lists Hue lights with brightness and colour, skipping odd entries", () => {
    const lights = parseHueLights(HUE_LIGHTS, NOW);
    expect(lights.map((l) => l.id)).toEqual([hueId, "hue.9a8b7c6d_1111_2222_3333_444455556666"]);
    expect(lights[0]).toMatchObject({ rid: "3f1c2a8e-0c3d-4c5e-9b1a-2f6d7e8a9b01", dimmable: true, colour: true });
    expect(lights[0]?.entity).toMatchObject({ state: "on", brightness: 128, color: "#ff0000", name: "Kitchen pendant" });
    expect(lights[1]).toMatchObject({ dimmable: false, colour: false, entity: { state: "off" } });
    expect(parseHueLights({ errors: [{ description: "bridge offline" }] }, NOW)).toEqual([]);
  });

  it("turns taps into Hue bodies, and refuses what the light can't do", () => {
    const [pendant, porch] = parseHueLights(HUE_LIGHTS, NOW);
    if (!pendant || !porch) throw new Error("no lights");
    expect(hueBody(pendant, { action: "toggle" })).toEqual({ on: { on: false } });
    expect(hueBody(pendant, { action: "brightness", value: 250 })).toEqual({ on: { on: true }, dimming: { brightness: 100 } });
    expect(hueBody(pendant, { action: "color", value: 0xff0000 })).toEqual({ on: { on: true }, color: { xy: { x: 0.6401, y: 0.33 } } });
    expect(hueBody(pendant, { action: "color", value: 0x1000000 })).toBeNull();
    expect(hueBody(porch, { action: "brightness", value: 50 })).toBeNull();
    expect(hueBody(porch, { action: "color", value: 0 })).toBeNull();
  });

  it("lists LIFX lights, an offline one as unavailable, and turns taps into state bodies", () => {
    const lights = parseLifxLights(LIFX_LIGHTS, NOW);
    expect(lights.map((l) => l.id)).toEqual([lifxId, "lifx.d073d5000002"]);
    expect(lights[0]?.entity).toMatchObject({ state: "on", brightness: 64, color: "#0000ff" });
    expect(lights[1]?.entity).toMatchObject({ state: "unavailable" });
    expect(lights[1]?.entity.color).toBeUndefined();
    const [living, hall] = lights;
    if (!living || !hall) throw new Error("no lights");
    expect(lifxBody(living, { action: "toggle" })).toEqual({ power: "off", duration: 0.3 });
    expect(lifxBody(living, { action: "brightness", value: 40 })).toEqual({ power: "on", brightness: 0.4, duration: 0.3 });
    expect(lifxBody(living, { action: "color", value: 0x0a84ff })).toEqual({ power: "on", color: "#0a84ff", duration: 0.3 });
    expect(lifxBody(hall, { action: "color", value: 0 })).toBeNull();
    expect(parseLifxLights({ error: "Invalid token" }, NOW)).toEqual([]);
  });
});

describe("Hue and LIFX over the network", () => {
  useTestServer();
  const calls: { url: string; method: string; body: unknown; headers: Headers }[] = [];
  let hueKeyAccepted = true;

  beforeEach(async () => {
    clearMemoryCache();
    resetHueForTests();
    resetLifxForTests();
    resetSmartHomeAuthForTests();
    resetHaForTests();
    resetNativeForTests();
    calls.length = 0;
    hueKeyAccepted = true;
    vi.stubEnv("HUE_CLIENT_ID", "hue-client");
    vi.stubEnv("HUE_CLIENT_SECRET", "hue-secret");
    await setSecret(LEGACY_ACCOUNT_ID, "hue.refreshToken", "hue-refresh");
    await setSecret(LEGACY_ACCOUNT_ID, "hue.appKey", null);
    await setSecret(LEGACY_ACCOUNT_ID, "lifx.token", "c4d2f1lifxpersonaltoken0000");
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      const body = init.body && typeof init.body === "string" ? (safeJson(init.body) as unknown) : undefined;
      const headers = new Headers(init.headers);
      calls.push({ url, method: init.method ?? "GET", body, headers });
      // Hue's token endpoint has answered expires_in as a string; the code reads either.
      if (url === "https://api.meethue.com/v2/oauth2/token")
        return Promise.resolve(Response.json({ access_token: "hue-access", expires_in: "604799", refresh_token: "hue-refresh-2" }));
      if (url === "https://api.meethue.com/route/api/0/config")
        return Promise.resolve(Response.json([{ success: { "/config/linkbutton": true } }]));
      if (url === "https://api.meethue.com/route/api") return Promise.resolve(Response.json([{ success: { username: "bridge-key-1" } }]));
      if (url.startsWith("https://api.meethue.com/route/clip/v2/")) {
        if (!hueKeyAccepted && headers.get("hue-application-key") === "bridge-key-1") {
          hueKeyAccepted = true;
          return Promise.resolve(new Response("", { status: 403 }));
        }
        if (url.endsWith("/resource/light")) return Promise.resolve(Response.json(HUE_LIGHTS));
        return Promise.resolve(Response.json({ data: [{ rid: "x", rtype: "light" }], errors: [] }));
      }
      if (url === "https://api.lifx.com/v1/lights/all") return Promise.resolve(Response.json(LIFX_LIGHTS));
      if (url.startsWith("https://api.lifx.com/v1/lights/id:"))
        return Promise.resolve(Response.json({ results: [{ status: "ok" }] }, { status: 207 }));
      return Promise.resolve(new Response("", { status: 404 }));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("makes a Hue bridge key once, reads lights with both headers, and keeps the list 15 seconds", async () => {
    const first = await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW);
    expect(Object.keys(first)).toEqual([hueId]);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "hue.appKey")).toBe("bridge-key-1");
    // The rotated refresh token is kept.
    expect(await getSecret(LEGACY_ACCOUNT_ID, "hue.refreshToken")).toBe("hue-refresh-2");
    const read = calls.find((c) => c.url.endsWith("/resource/light"));
    expect(read?.headers.get("authorization")).toBe("Bearer hue-access");
    expect(read?.headers.get("hue-application-key")).toBe("bridge-key-1");

    await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW + 5000);
    expect(calls.filter((c) => c.url.endsWith("/resource/light"))).toHaveLength(1);
    await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW + 16_000);
    expect(calls.filter((c) => c.url.endsWith("/resource/light"))).toHaveLength(2);
    expect(calls.filter((c) => c.url === "https://api.meethue.com/route/api")).toHaveLength(1);
  });

  it("makes a new Hue key when the bridge forgets the old one", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "hue.appKey", "bridge-key-1");
    hueKeyAccepted = false;
    calls.length = 0;
    expect(Object.keys(await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW))).toEqual([hueId]);
    expect(calls.filter((c) => c.url === "https://api.meethue.com/route/api")).toHaveLength(1);
  });

  it("sends Hue and LIFX taps and shows them at once", async () => {
    await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW);
    expect(await hueAct(LEGACY_ACCOUNT_ID, hueId, { action: "off" }, NOW + 1000)).toBe("ok");
    const put = calls.find((c) => c.method === "PUT" && c.url.includes("/resource/light/"));
    expect(put?.url).toBe("https://api.meethue.com/route/clip/v2/resource/light/3f1c2a8e-0c3d-4c5e-9b1a-2f6d7e8a9b01");
    expect(put?.body).toEqual({ on: { on: false } });
    expect((await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW + 2000))[hueId]?.state).toBe("off");

    expect(await lifxAct(LEGACY_ACCOUNT_ID, lifxId, { action: "color", value: 0x00ff00 }, NOW)).toBe("ok");
    const state = calls.find((c) => c.url === "https://api.lifx.com/v1/lights/id:d073d5000001/state");
    expect(state?.method).toBe("PUT");
    expect(state?.headers.get("authorization")).toBe("Bearer c4d2f1lifxpersonaltoken0000");
    expect(state?.body).toEqual({ power: "on", color: "#00ff00", duration: 0.3 });
    expect((await lifxEntities(LEGACY_ACCOUNT_ID, new Set([lifxId]), NOW + 1000))[lifxId]?.color).toBe("#00ff00");
    expect(await lifxAct(LEGACY_ACCOUNT_ID, "lifx.d073d5999999", { action: "on" }, NOW)).toBe("forbidden");
  });

  it("reaches the wall through the Smart device feed, only for lights on a widget", async () => {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [
      { id: "h1", type: "haEntity", provider: "hue", x: 0, y: 0, w: 2, h: 2, showBackground: true, entityId: hueId, control: "light" },
      { id: "l1", type: "haEntity", provider: "lifx", x: 2, y: 0, w: 2, h: 2, showBackground: true, entityId: lifxId, control: "light" },
    ];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    const token = (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
    const headers = { "x-display-token": token };

    const data = (await (await haGET(req("/api/display/ha/", { headers }))).json()) as HaData;
    expect(Object.keys(data.entities).sort()).toEqual([hueId, lifxId]);

    const tap = (entity: string, action: string, extra: Record<string, unknown> = {}) =>
      haPOST(req("/api/display/ha/", { method: "POST", headers, body: JSON.stringify({ entity, action, ...extra }) }));
    expect((await tap(hueId, "brightness", { value: 30 })).status).toBe(200);
    expect((await tap(lifxId, "toggle")).status).toBe(200);
    expect((await tap("hue.9a8b7c6d_1111_2222_3333_444455556666", "on")).status).toBe(403);
    expect((await tap(lifxId, "scene", { option: "Party" })).status).toBe(403);
  });

  it("shows nothing without a LIFX token or a Hue connection", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "lifx.token", null);
    expect(await lifxEntities(LEGACY_ACCOUNT_ID, new Set([lifxId]), NOW)).toEqual({});
    await setSecret(LEGACY_ACCOUNT_ID, "hue.refreshToken", null);
    expect(await hueEntities(LEGACY_ACCOUNT_ID, new Set([hueId]), NOW)).toEqual({});
  });
});

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}
