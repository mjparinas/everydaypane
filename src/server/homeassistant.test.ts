import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as adminGET, PUT as adminPUT } from "@/app/api/admin/ha/route";
import { GET as cameraGET } from "@/app/api/display/camera/route";
import { GET as haGET, POST as haPOST } from "@/app/api/display/ha/route";
import type { DashboardConfig } from "@/lib/config/schema";
import type { HaData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { resetHaForTests, serviceFor, trimState, usedEntities } from "./homeassistant";
import { getSecret, setSecret } from "./secrets";

const HA = "https://ha.example.com";

describe("Home Assistant actions", () => {
  it("allows a fixed set of services per domain", () => {
    expect(serviceFor("light.kitchen", "toggle")).toEqual({ path: "/api/services/light/toggle", body: { entity_id: "light.kitchen" } });
    expect(serviceFor("light.kitchen", "brightness", 140)?.body).toEqual({ entity_id: "light.kitchen", brightness_pct: 100 });
    expect(serviceFor("switch.kettle", "brightness", 50)).toBeNull();
    expect(serviceFor("cover.garage", "open")?.path).toBe("/api/services/cover/open_cover");
    expect(serviceFor("climate.hall", "temperature", 21.3)?.body).toEqual({ entity_id: "climate.hall", temperature: 21.5 });
    expect(serviceFor("climate.hall", "temperature", 400)).toBeNull();
    expect(serviceFor("scene.movie", "press")?.path).toBe("/api/services/scene/turn_on");
    expect(serviceFor("button.restart", "press")?.path).toBe("/api/services/button/press");
    expect(serviceFor("alarm_control_panel.home", "off")).toBeNull();
  });

  it("can lock a door but never unlock it", () => {
    expect(serviceFor("lock.front", "lock")?.path).toBe("/api/services/lock/lock");
    for (const action of ["toggle", "on", "off", "open", "press"] as const) expect(serviceFor("lock.front", action)).toBeNull();
  });

  it("keeps only what a tile needs from a state", () => {
    expect(
      trimState({
        entity_id: "climate.hall",
        state: "heat",
        last_changed: "2026-11-17T08:00:00Z",
        attributes: { friendly_name: "Hallway", current_temperature: 20.5, temperature: 21, hvac_action: "heating", secret: "x" },
      }),
    ).toMatchObject({ id: "climate.hall", state: "heat", name: "Hallway", current: 20.5, target: 21, action: "heating" });
    expect(trimState({ state: "on" })).toBeNull();
  });
});

describe("Home Assistant routes", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    resetHaForTests();
  });

  async function setUp(): Promise<string> {
    const stored = await loadConfig();
    const config: DashboardConfig = structuredClone(stored.config);
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [
      { id: "w1", type: "haEntity", x: 0, y: 0, w: 2, h: 1, entityId: "light.kitchen", control: "auto" },
      { id: "w2", type: "haEntity", x: 2, y: 0, w: 2, h: 1, entityId: "lock.front", control: "auto" },
      { id: "w3", type: "camera", x: 4, y: 0, w: 2, h: 2, entityId: "camera.driveway", refreshSeconds: 10 },
    ];
    config.integrations.homeAssistant = {
      url: HA,
      doorbell: { entityId: "event.doorbell_ring", cameraEntityId: "camera.front_door", seconds: 30 },
    };
    expect((await saveConfig(config, stored.version)).ok).toBe(true);
    await setSecret("homeAssistant.token", "ha-token");
    await setSecret("homeAssistant.accessId", "cf-id.access");
    await setSecret("homeAssistant.accessSecret", "cf-secret");
    expect(usedEntities(config).all).toEqual(
      new Set(["light.kitchen", "lock.front", "camera.driveway", "camera.front_door", "event.doorbell_ring"]),
    );
    return (await addDevice("Kitchen", null)).token;
  }

  const states = [
    { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen", brightness: 128 } },
    { entity_id: "lock.front", state: "unlocked", attributes: { friendly_name: "Front door" } },
    { entity_id: "event.doorbell_ring", state: "2026-11-17T18:00:00.000Z", attributes: {} },
    { entity_id: "light.bedroom", state: "off", attributes: { friendly_name: "Bedroom" } },
  ];

  it("sends the token and the Cloudflare Access pair, and gives displays only the entities widgets use", async () => {
    const token = await setUp();
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return Promise.resolve(Response.json(states));
    });
    const r = await haGET(req("/api/display/ha/", { headers: { "x-display-token": token } }));
    const data = (await r.json()) as HaData;
    expect(Object.keys(data.entities).sort()).toEqual(["event.doorbell_ring", "light.kitchen", "lock.front"]);
    expect(data.entities["light.kitchen"]).toMatchObject({ name: "Kitchen", brightness: 128 });
    expect(calls[0]?.url).toBe(`${HA}/api/states`);
    expect(calls[0]?.headers).toMatchObject({
      Authorization: "Bearer ha-token",
      "CF-Access-Client-Id": "cf-id.access",
      "CF-Access-Client-Secret": "cf-secret",
    });
    expect((await haGET(req("/api/display/ha/"))).status).toBe(401);
  });

  it("passes on allowed taps only, for entities a widget shows", async () => {
    const token = await setUp();
    const posted: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(Response.json([]));
    });
    const tap = (body: object) =>
      haPOST(req("/api/display/ha/", { method: "POST", headers: { "x-display-token": token }, body: JSON.stringify(body) }));
    expect((await tap({ entity: "light.kitchen", action: "toggle" })).status).toBe(200);
    expect((await tap({ entity: "lock.front", action: "lock" })).status).toBe(200);
    expect((await tap({ entity: "lock.front", action: "open" })).status).toBe(403);
    expect((await tap({ entity: "light.bedroom", action: "toggle" })).status).toBe(403);
    expect((await tap({ entity: "camera.driveway", action: "on" })).status).toBe(403);
    expect(posted).toEqual([
      { url: `${HA}/api/services/light/toggle`, body: { entity_id: "light.kitchen" } },
      { url: `${HA}/api/services/lock/lock`, body: { entity_id: "lock.front" } },
    ]);
    const other = req("/api/display/ha/", {
      method: "POST",
      headers: { "x-display-token": token, origin: "https://evil.example" },
      body: JSON.stringify({ entity: "light.kitchen", action: "toggle" }),
    });
    expect((await haPOST(other)).status).toBe(403);
  });

  it("explains a Cloudflare Access refusal instead of following it to the sign-in page", async () => {
    const token = await setUp();
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(null, { status: 302, headers: { location: "https://x.cloudflareaccess.com/" } })),
    );
    const r = await haGET(req("/api/display/ha/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/Cloudflare Access/);
  });

  it("serves only the cameras the dashboard uses", async () => {
    const token = await setUp();
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    });
    const ok = await cameraGET(req(`/api/display/camera/?e=camera.front_door&t=${token}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect((await cameraGET(req(`/api/display/camera/?e=camera.garage&t=${token}`))).status).toBe(404);
    expect((await cameraGET(req(`/api/display/camera/?e=camera.front_door`))).status).toBe(401);
    expect(urls).toEqual([`${HA}/api/camera_proxy/camera.front_door`]);
  });

  it("stores the token and Access pair for admins without ever sending them back", async () => {
    await setUp();
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(Response.json(url.endsWith("/api/") ? { message: "API running." } : states)));
    const admin = await cookieFor("admin@example.com");
    const put = (body: object) =>
      adminPUT(req("/api/admin/ha/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify(body) }));
    expect((await put({ token: "new-token" })).status).toBe(200);
    expect(await getSecret("homeAssistant.token")).toBe("new-token");
    expect(await getSecret("homeAssistant.accessId")).toBe("cf-id.access");

    const text = await (await adminGET(req("/api/admin/ha/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(text)).toMatchObject({ tokenSet: true, accessSet: true, connected: true, message: "API running." });
    expect(text).not.toContain("new-token");
    expect(text).not.toContain("cf-secret");

    expect((await put({ accessId: null, accessSecret: null })).status).toBe(200);
    expect(await getSecret("homeAssistant.accessSecret")).toBeNull();
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/admin/ha/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
