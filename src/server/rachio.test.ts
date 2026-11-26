import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/rachio/route";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/household/rachio/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { RachioData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { nextWatering, rachioFeed, rachioTime, skipNext, trimSchedule, type Controller } from "./rachio";
import { getSecret, setSecret } from "./secrets";

// Shapes from Rachio's public API (api.rach.io/1/public): person/info, person/<id> and device/<id>/scheduleitem, as
// community clients read them. This sandbox can't reach Rachio.
const KEY = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const NOW = Date.UTC(2026, 10, 25, 20); // Tue Nov 25, 12 PM in Langley
const HOUR = 3_600_000;

const device = {
  id: "dev-front",
  name: "Front yard",
  status: "ONLINE",
  on: true,
  zones: [
    { id: "z1", zoneNumber: 1, name: "Front lawn", enabled: true },
    { id: "z2", zoneNumber: 2, name: "Beds", enabled: true },
    { id: "z3", zoneNumber: 3, name: "", enabled: true },
  ],
  scheduleRules: [{ id: "rule-am", name: "Lawn mornings", enabled: true }],
  flexScheduleRules: [{ id: "rule-flex", name: "Beds flex", enabled: true }],
};
const person = { id: "person-1", username: "melvin", devices: [device, { id: "gone", name: "Old", deleted: true }] };
const items = [
  {
    scheduleRuleId: "rule-flex",
    absoluteStartDate: NOW + 26 * HOUR,
    zones: [{ zoneId: "z2", duration: 900 }],
  },
  {
    scheduleRuleId: "rule-am",
    absoluteStartDate: NOW + 18 * HOUR,
    totalDuration: 1500,
    zones: [
      { zoneId: "z1", duration: 1200 },
      { zoneNumber: 3, duration: 300 },
    ],
  },
  { scheduleRuleId: "rule-am", startDate: "not a time" },
];

function stubRachio(answers: Partial<Record<string, () => Response>> = {}) {
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/1/public/", "");
    void init;
    const answer = answers[path];
    if (answer) return Promise.resolve(answer());
    if (path === "person/info") return Promise.resolve(Response.json({ id: "person-1" }));
    if (path === "person/person-1") return Promise.resolve(Response.json(person));
    if (path === "device/dev-front/scheduleitem") return Promise.resolve(Response.json(items));
    if (path === "schedulerule/skip" || path === "device/rain_delay") return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function withWidget(allowSkip = true, devices: string[] = []): DashboardConfig {
  const config = defaultConfig();
  config.views[0]!.widgets.push({ ...newWidget("rachio", "sprinklers", { x: 0, y: 0 }), allowSkip, devices });
  return config;
}

describe("Rachio trims", () => {
  it("reads epoch ms, epoch seconds and ISO times", () => {
    expect(rachioTime(NOW)).toBe(NOW);
    expect(rachioTime(NOW / 1000)).toBe(NOW);
    expect(rachioTime("2026-11-25T20:00:00Z")).toBe(NOW);
    expect(rachioTime("soon")).toBeNull();
    expect(rachioTime(0)).toBeNull();
  });

  it("names each watering after its schedule and zones, soonest first", () => {
    expect(trimSchedule(items, device)).toEqual([
      { start: NOW + 18 * HOUR, name: "Lawn mornings", minutes: 25, zones: ["Front lawn", "Zone 3"], ruleId: "rule-am", flex: false },
      { start: NOW + 26 * HOUR, name: "Beds flex", minutes: 15, zones: ["Beds"], ruleId: "rule-flex", flex: true },
    ]);
    expect(trimSchedule({ scheduleItems: [] }, device)).toEqual([]);
    expect(trimSchedule(null, device)).toEqual([]);
  });

  it("passes over waterings a rain delay covers or the wall skipped, and keeps one still running", () => {
    const upcoming = trimSchedule(items, device);
    const c: Controller = { id: "dev-front", name: "Front yard", online: true, rainDelayUntil: null, upcoming };
    expect(nextWatering(c, [], NOW)?.ruleId).toBe("rule-am");
    expect(nextWatering(c, [], NOW + 18 * HOUR + 10 * 60_000)?.ruleId).toBe("rule-am");
    expect(nextWatering(c, [`dev-front|${NOW + 18 * HOUR}`], NOW)?.ruleId).toBe("rule-flex");
    expect(nextWatering({ ...c, rainDelayUntil: NOW + 20 * HOUR }, [], NOW)?.ruleId).toBe("rule-flex");
    expect(nextWatering({ ...c, rainDelayUntil: NOW + 48 * HOUR }, [], NOW)).toBeNull();
  });
});

describe("Rachio feed and skip", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("says it isn't set up without a key, and asks Rachio nothing", async () => {
    const fetch = stubRachio();
    expect(await rachioFeed(LEGACY_ACCOUNT_ID, NOW)).toEqual({ updatedAt: NOW, configured: false, controllers: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the key as a bearer token, never in a URL, and shares one read", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    const fetch = stubRachio();
    const data = await rachioFeed(LEGACY_ACCOUNT_ID, NOW);
    expect(data).toEqual({
      updatedAt: NOW,
      configured: true,
      controllers: [
        {
          id: "dev-front",
          name: "Front yard",
          online: true,
          rainDelayUntil: null,
          next: { start: NOW + 18 * HOUR, name: "Lawn mornings", minutes: 25, zones: ["Front lawn", "Zone 3"] },
        },
      ],
    });
    for (const [u, init] of fetch.mock.calls) {
      expect(String(u)).not.toContain(KEY);
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    }
    // No rule ids reach a display.
    expect(JSON.stringify(data)).not.toContain("rule-am");
    const calls = fetch.mock.calls.length;
    await rachioFeed(LEGACY_ACCOUNT_ID, NOW + 60_000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("keeps a controller whose schedule read fails, without a next watering", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    stubRachio({ "device/dev-front/scheduleitem": () => new Response("busy", { status: 500 }) });
    const data = await rachioFeed(LEGACY_ACCOUNT_ID, NOW);
    expect(data.controllers).toEqual([
      { id: "dev-front", name: "Front yard", online: true, rainDelayUntil: null, next: null, noSchedule: true },
    ]);
  });

  it("says when Rachio refuses the key", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    stubRachio({ "person/info": () => new Response("no", { status: 401 }) });
    expect(await rachioFeed(LEGACY_ACCOUNT_ID, NOW)).toMatchObject({
      configured: true,
      controllers: [],
      error: expect.stringContaining("refused"),
    });
  });

  it("skips a fixed schedule's next run, then shows the watering after it", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    const fetch = stubRachio();
    expect(await skipNext(LEGACY_ACCOUNT_ID, withWidget(), "dev-front", NOW + 18 * HOUR, NOW)).toBe("skipped");
    const put = fetch.mock.calls.find(([u]) => String(u).endsWith("/schedulerule/skip"));
    expect(put?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ id: "rule-am" });
    // Rachio may still list the skipped run; the wall moves on anyway.
    const data = await rachioFeed(LEGACY_ACCOUNT_ID, NOW + 1000);
    expect(data.controllers[0]?.next?.name).toBe("Beds flex");
  });

  it("falls back to a rain delay ending just after the watering when Rachio won't skip the rule", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    const fetch = stubRachio({
      "schedulerule/skip": () => Response.json({ code: "900", error: "not supported for 3.0 API" }, { status: 405 }),
    });
    expect(await skipNext(LEGACY_ACCOUNT_ID, withWidget(), "dev-front", NOW + 18 * HOUR, NOW)).toBe("rain-delay");
    const delay = fetch.mock.calls.find(([u]) => String(u).endsWith("/device/rain_delay"));
    expect(JSON.parse(String(delay?.[1]?.body))).toEqual({ id: "dev-front", duration: 18 * 3600 + 25 * 60 + 60 });
  });

  it("only skips from a widget that allows it, and only the watering the wall showed", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    const fetch = stubRachio();
    expect(await skipNext(LEGACY_ACCOUNT_ID, withWidget(false), "dev-front", NOW + 18 * HOUR, NOW)).toBe("not-allowed");
    expect(await skipNext(LEGACY_ACCOUNT_ID, withWidget(true, ["other"]), "dev-front", NOW + 18 * HOUR, NOW)).toBe("not-allowed");
    expect(await skipNext(LEGACY_ACCOUNT_ID, withWidget(), "dev-front", NOW + 26 * HOUR, NOW)).toBe("gone");
    expect(fetch.mock.calls.some(([u]) => /skip|rain_delay/.test(String(u)))).toBe(false);
  });

  it("serves displays and turns away requests without a display", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey", KEY);
    stubRachio();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/rachio/", { headers: { "x-display-token": token } }));
    expect(((await r.json()) as RachioData).controllers[0]?.name).toBe("Front yard");
    expect((await displayGET(req("/api/display/rachio/"))).status).toBe(401);
  });
});

describe("Settings › Sprinklers", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("checks a key with Rachio before saving it, and never sends it back", async () => {
    const admin = await cookieFor("admin@example.com");
    const put = () =>
      adminPUT(req("/api/household/rachio/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ apiKey: KEY }) }));
    stubRachio({ "person/info": () => new Response("no", { status: 401 }) });
    expect((await put()).status).toBe(400);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey")).toBeNull();

    stubRachio();
    expect(await (await put()).json()).toEqual({ configured: true, controllers: [{ id: "dev-front", name: "Front yard" }], error: "" });
    expect(await getSecret(LEGACY_ACCOUNT_ID, "rachio.apiKey")).toBe(KEY);
    const text = await (await adminGET(req("/api/household/rachio/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(text)).toEqual({ configured: true, controllers: [{ id: "dev-front", name: "Front yard" }], error: "" });
    expect(text).not.toContain(KEY);
  });
});
