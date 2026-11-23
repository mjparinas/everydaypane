import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as adminGET, PUT as adminPUT } from "@/app/api/admin/ha/route";
import { GET as artGET } from "@/app/api/display/art/route";
import { GET as cameraGET } from "@/app/api/display/camera/route";
import { GET as haGET, POST as haPOST } from "@/app/api/display/ha/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import type { HaData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { resetHaForTests, serviceFor, trimMedia, trimState, usedEntities } from "./homeassistant";
import { getSecret, setSecret } from "./secrets";

const HA = "https://ha.example.com";

describe("Home Assistant actions", () => {
  it("reads who's-home entities but never controls them", () => {
    const config = structuredClone(defaultConfig());
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets.push({
      id: "who",
      type: "presence",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      showBackground: true,
      entities: [
        { entityId: "person.melvin", label: "Melvin" },
        { entityId: "device_tracker.phone", label: "" },
        { entityId: "", label: "Nobody" },
      ],
    });
    const used = usedEntities(config);
    expect(used.all.has("person.melvin")).toBe(true);
    expect(used.all.has("device_tracker.phone")).toBe(true);
    expect(used.all.has("")).toBe(false);
    expect(used.controls.has("person.melvin")).toBe(false);
    expect(used.controls.has("device_tracker.phone")).toBe(false);
  });

  it("reads the screen saver's motion sensors but never controls them", () => {
    const config = structuredClone(defaultConfig());
    config.screenSaver.motionEntityIds = ["binary_sensor.hall_motion"];
    const used = usedEntities(config);
    expect(used.all.has("binary_sensor.hall_motion")).toBe(true);
    expect(used.controls.has("binary_sensor.hall_motion")).toBe(false);
  });

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

  it("plays, skips, sets the volume and picks a source on a media player", () => {
    expect(serviceFor("media_player.kitchen", "playPause")?.path).toBe("/api/services/media_player/media_play_pause");
    expect(serviceFor("media_player.kitchen", "next")?.path).toBe("/api/services/media_player/media_next_track");
    expect(serviceFor("media_player.kitchen", "previous")?.path).toBe("/api/services/media_player/media_previous_track");
    expect(serviceFor("media_player.kitchen", "volume", 35)?.body).toEqual({ entity_id: "media_player.kitchen", volume_level: 0.35 });
    expect(serviceFor("media_player.kitchen", "volume", 400)?.body).toMatchObject({ volume_level: 1 });
    expect(serviceFor("media_player.kitchen", "mute")?.body).toMatchObject({ is_volume_muted: true });
    expect(serviceFor("media_player.spotify_melvin", "source", undefined, "Kitchen")).toEqual({
      path: "/api/services/media_player/select_source",
      body: { entity_id: "media_player.spotify_melvin", source: "Kitchen" },
    });
    expect(serviceFor("media_player.kitchen", "source")).toBeNull();
    expect(serviceFor("light.kitchen", "next")).toBeNull();
  });

  it("never passes on the art link's access token", () => {
    const m = trimMedia({
      media_title: "Here Comes the Sun",
      media_artist: "The Beatles",
      entity_picture: "/api/media_player_proxy/media_player.kitchen?token=secret-ha-token&cache=1",
      media_position: 12.5,
      media_position_updated_at: "2026-11-17T20:00:00+00:00",
      volume_level: 0.4,
      source_list: ["Morning mix", 7, "CBC Radio One"],
      supported_features: 4127295,
    });
    expect(m).toMatchObject({ title: "Here Comes the Sun", artist: "The Beatles", position: 12.5, volume: 0.4, features: 4127295 });
    expect(m.positionAt).toBe(Date.parse("2026-11-17T20:00:00Z"));
    expect(m.sources).toEqual(["Morning mix", "CBC Radio One"]);
    expect(m.art).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(m)).not.toContain("secret-ha-token");
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
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config: DashboardConfig = structuredClone(stored.config);
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [
      { id: "w1", type: "haEntity", x: 0, y: 0, w: 2, h: 1, showBackground: true, entityId: "light.kitchen", control: "auto" },
      { id: "w2", type: "haEntity", x: 2, y: 0, w: 2, h: 1, showBackground: true, entityId: "lock.front", control: "auto" },
      { id: "w3", type: "camera", x: 4, y: 0, w: 2, h: 2, showBackground: true, entityId: "camera.driveway", refreshSeconds: 10 },
      {
        id: "w4",
        type: "media",
        x: 6,
        y: 0,
        w: 4,
        h: 2,
        showBackground: true,
        provider: "homeAssistant",
        entityId: "media_player.kitchen",
        playerId: "",
        showArt: true,
        showVolume: true,
        showSources: true,
      },
    ];
    config.integrations.homeAssistant = {
      url: HA,
      doorbell: { entityId: "event.doorbell_ring", cameraEntityId: "camera.front_door", seconds: 30 },
    };
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    await setSecret(LEGACY_ACCOUNT_ID, "homeAssistant.token", "ha-token");
    await setSecret(LEGACY_ACCOUNT_ID, "homeAssistant.accessId", "cf-id.access");
    await setSecret(LEGACY_ACCOUNT_ID, "homeAssistant.accessSecret", "cf-secret");
    expect(usedEntities(config).all).toEqual(
      new Set(["light.kitchen", "lock.front", "media_player.kitchen", "camera.driveway", "camera.front_door", "event.doorbell_ring"]),
    );
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
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

  it("passes on music taps for the players a widget shows", async () => {
    const token = await setUp();
    const posted: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(Response.json([]));
    });
    const tap = (body: object) =>
      haPOST(req("/api/display/ha/", { method: "POST", headers: { "x-display-token": token }, body: JSON.stringify(body) }));
    expect((await tap({ entity: "media_player.kitchen", action: "playPause" })).status).toBe(200);
    expect((await tap({ entity: "media_player.kitchen", action: "source", option: "CBC Radio One" })).status).toBe(200);
    expect((await tap({ entity: "media_player.living_room", action: "playPause" })).status).toBe(403);
    expect((await tap({ entity: "light.kitchen", action: "next" })).status).toBe(403);
    expect(posted).toEqual([
      { url: `${HA}/api/services/media_player/media_play_pause`, body: { entity_id: "media_player.kitchen" } },
      { url: `${HA}/api/services/media_player/select_source`, body: { entity_id: "media_player.kitchen", source: "CBC Radio One" } },
    ]);
  });

  it("serves album art only for the players the dashboard shows", async () => {
    const token = await setUp();
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    });
    const ok = await artGET(req(`/api/display/art/?e=media_player.kitchen&k=abc&t=${token}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("max-age");
    expect((await artGET(req(`/api/display/art/?e=media_player.living_room&t=${token}`))).status).toBe(404);
    expect((await artGET(req(`/api/display/art/?e=media_player.kitchen`))).status).toBe(401);
    expect(urls).toEqual([`${HA}/api/media_player_proxy/media_player.kitchen`]);
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
    expect(await getSecret(LEGACY_ACCOUNT_ID, "homeAssistant.token")).toBe("new-token");
    expect(await getSecret(LEGACY_ACCOUNT_ID, "homeAssistant.accessId")).toBe("cf-id.access");

    const text = await (await adminGET(req("/api/admin/ha/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(text)).toMatchObject({ tokenSet: true, accessSet: true, connected: true, message: "API running." });
    expect(text).not.toContain("new-token");
    expect(text).not.toContain("cf-secret");

    expect((await put({ accessId: null, accessSecret: null })).status).toBe(200);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "homeAssistant.accessSecret")).toBeNull();
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/admin/ha/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
