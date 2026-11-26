import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/packages/route";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/household/packages/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { PackageCarrier, PackagesData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { packagesFeed, saveTrackKey, trackOf } from "./packages";
import { getSecret, setSecret } from "./secrets";

// Shapes from 17TRACK's tracking API v2.2 documentation (register, gettrackinfo, getquota). This sandbox can't reach
// api.17track.net.
const KEY = "A1B2C3D4E5F60718293A4B5C6D7E8F90";
const NOW = Date.UTC(2026, 10, 26, 18); // Thu Nov 26, 10 AM in Langley
const UPS = "1Z999AA10123456784";
const CP = "7023210039414604";

const infoOut = {
  latest_status: { status: "OutForDelivery", sub_status: "OutForDelivery_Other" },
  latest_event: {
    time_iso: "2026-11-26T07:42:00-08:00",
    time_utc: "2026-11-26T15:42:00Z",
    description: "Out For Delivery Today",
    location: "LANGLEY, BC, CA",
  },
  time_metrics: { estimated_delivery_date: { source: "Official", from: "2026-11-26T09:00:00-08:00", to: "2026-11-26T21:00:00-08:00" } },
};
const infoTransit = {
  latest_status: { status: "InTransit", sub_status: "InTransit_Other" },
  latest_event: { time_utc: "2026-11-25T22:10:00Z", description: "Item processed", location: "RICHMOND, BC" },
  time_metrics: { estimated_delivery_date: { source: "Official", from: "2026-11-28", to: null } },
};

type Body = { number: string; carrier?: number }[];

function stub17(over: Partial<Record<string, (body: Body) => Response>> = {}) {
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace("/track/v2.2/", "");
    const body = JSON.parse(String(init?.body ?? "[]")) as Body;
    const answer = over[path];
    if (answer) return Promise.resolve(answer(body));
    if (path === "register")
      return Promise.resolve(
        Response.json({ code: 0, data: { accepted: body.map((b) => ({ number: b.number, carrier: b.carrier ?? 3041 })), rejected: [] } }),
      );
    if (path === "gettrackinfo")
      return Promise.resolve(
        Response.json({
          code: 0,
          data: {
            accepted: body.map((b) => ({ number: b.number, carrier: b.carrier, track_info: b.number === UPS ? infoOut : infoTransit })),
            rejected: [],
          },
        }),
      );
    if (path === "getquota")
      return Promise.resolve(Response.json({ code: 0, data: { quota_total: 200, quota_used: 3, quota_remain: 197 } }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function withPackages(list: { id: string; carrier: PackageCarrier; trackingNumber: string; label?: string }[]): DashboardConfig {
  const config = defaultConfig();
  config.views[0]!.widgets.push({ ...newWidget("packages", "pkgs", { x: 0, y: 0 }), packages: list });
  return config;
}

const two = () =>
  withPackages([
    { id: "p1", carrier: "ups", trackingNumber: UPS, label: "Lego set" },
    { id: "p2", carrier: "other", trackingNumber: `${CP.slice(0, 8)} ${CP.slice(8)}` },
  ]);

describe("17TRACK track_info", () => {
  it("reads status, latest scan, expected window and delivery time", () => {
    expect(trackOf(infoOut)).toEqual({
      status: "outForDelivery",
      summary: "Out For Delivery Today",
      where: "LANGLEY, BC, CA",
      eventAt: Date.parse("2026-11-26T15:42:00Z"),
      etaFrom: Date.parse("2026-11-26T17:00:00Z"),
      etaTo: Date.parse("2026-11-27T05:00:00Z"),
    });
    expect(trackOf(infoTransit)).toMatchObject({ status: "inTransit", etaFrom: Date.parse("2026-11-28T12:00:00Z") });
    expect(trackOf(infoTransit).etaTo).toBeUndefined();
    const delivered = trackOf({
      latest_status: { status: "Delivered" },
      latest_event: { time_utc: "2026-11-26T19:14:00Z", description: "Delivered" },
    });
    expect(delivered).toMatchObject({ status: "delivered", deliveredAt: Date.parse("2026-11-26T19:14:00Z") });
  });

  it("copes with a number the carrier hasn't scanned and with nothing at all", () => {
    expect(trackOf({ latest_status: { status: "NotFound" } })).toEqual({
      status: "unknown",
      summary: "Waiting for the carrier's first scan",
    });
    expect(trackOf(null)).toEqual({ status: "unknown", summary: "No update yet" });
    expect(trackOf({ latest_status: { status: "AvailableForPickup" } }).status).toBe("pickup");
  });
});

describe("packages feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("lists the widget's numbers without asking 17TRACK when no key is saved", async () => {
    const fetch = stub17();
    const data = await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    expect(data.trackingConfigured).toBe(false);
    expect(data.packages.map((p) => [p.id, p.trackingNumber, p.status])).toEqual([
      ["p1", UPS, "unknown"],
      ["p2", CP, "unknown"],
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("registers each number once with the picked carrier, then reads status with the key in a header", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "packages.17track", KEY);
    const fetch = stub17();
    const data = await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    expect(data.trackingConfigured).toBe(true);
    expect(data.packages[0]).toMatchObject({ id: "p1", label: "Lego set", status: "outForDelivery", where: "LANGLEY, BC, CA" });
    expect(data.packages[1]).toMatchObject({ id: "p2", status: "inTransit", summary: "Item processed" });
    const calls = fetch.mock.calls.map(([u, init]) => [new URL(String(u)).pathname, JSON.parse(String(init?.body))] as const);
    expect(calls[0]).toEqual(["/track/v2.2/register", [{ number: UPS, carrier: 100002 }, { number: CP }]]);
    expect(calls[1]?.[0]).toBe("/track/v2.2/gettrackinfo");
    for (const [u, init] of fetch.mock.calls) {
      expect(String(u)).not.toContain(KEY);
      expect(new Headers(init?.headers).get("17token")).toBe(KEY);
    }

    // A new read after the cache runs out doesn't register again (that would spend quota).
    clearMemoryCache();
    fetch.mockClear();
    await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW + 16 * 60_000);
    expect(fetch.mock.calls.map(([u]) => new URL(String(u)).pathname)).toEqual(["/track/v2.2/gettrackinfo"]);
  });

  it("tries a number again without the carrier when 17TRACK refuses the pick, and treats already registered as fine", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "packages.17track", KEY);
    const sent: Body[] = [];
    stub17({
      register: (body) => {
        sent.push(body);
        return Response.json({
          code: 0,
          data: {
            accepted: body.filter((b) => b.number === CP).map((b) => ({ number: b.number, carrier: 3041 })),
            rejected: body
              .filter((b) => b.number !== CP)
              .map((b) =>
                b.carrier
                  ? { number: b.number, error: { code: -18019903, message: "Carrier not match" } }
                  : { number: b.number, error: { code: -18019901, message: "Already registered" } },
              ),
          },
        });
      },
    });
    const data = await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    expect(sent).toEqual([[{ number: UPS, carrier: 100002 }, { number: CP }], [{ number: UPS }]]);
    expect(data.packages[0]?.status).toBe("outForDelivery");
  });

  it("says when 17TRACK refuses the key and still lists the numbers", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "packages.17track", KEY);
    stub17({ register: () => new Response("no", { status: 401 }) });
    const data = await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    expect(data.error).toContain("Settings › Packages");
    expect(data.packages).toHaveLength(2);
  });

  it("serves displays and turns away requests without a display", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "packages.17track", KEY);
    stub17();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/packages/", { headers: { "x-display-token": token } }));
    expect(((await r.json()) as PackagesData).trackingConfigured).toBe(true);
    expect((await displayGET(req("/api/display/packages/"))).status).toBe(401);
  });
});

describe("Settings › Packages", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("checks a key with 17TRACK before saving it, and never sends it back", async () => {
    const admin = await cookieFor("admin@example.com");
    const put = () =>
      adminPUT(req("/api/household/packages/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ apiKey: KEY }) }));
    stub17({ getquota: () => new Response("no", { status: 401 }) });
    expect((await put()).status).toBe(400);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "packages.17track")).toBeNull();

    stub17();
    expect(await (await put()).json()).toEqual({ configured: true, remaining: 197, total: 200, error: "" });
    expect(await getSecret(LEGACY_ACCOUNT_ID, "packages.17track")).toBe(KEY);
    const text = await (await adminGET(req("/api/household/packages/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(text)).toEqual({ configured: true, remaining: 197, total: 200, error: "" });
    expect(text).not.toContain(KEY);
  });

  it("forgets registered numbers when the key changes", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "packages.17track", KEY);
    const fetch = stub17();
    await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    await saveTrackKey(LEGACY_ACCOUNT_ID, "B".repeat(32));
    fetch.mockClear();
    await packagesFeed(LEGACY_ACCOUNT_ID, two(), NOW);
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe("/track/v2.2/register");
  });
});
