import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as adminGET } from "@/app/api/admin/garbage/route";
import { GET as displayGET } from "@/app/api/display/garbage/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { GarbageData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { binKind, garbageFeed, trimLookup, trimSchedule, zoneString } from "./garbage";

const collections = {
  collections: {
    types: {
      "collection-1": { title: "Garbage" },
      "collection-2": { title: "Recycling" },
      "collection-3": { title: "Green Cart" },
    },
  },
};
const schedules = {
  DATA: [
    {
      months: [
        {
          events: [
            { date: "2026-11-12", collections: [{ id: 1, status: "is_scheduled" }] },
            {
              date: "2026-11-19",
              collections: [
                { id: 3, status: "is_scheduled" },
                { id: 1, status: "is_scheduled" },
              ],
            },
            {
              date: "2026-11-26",
              collections: [
                { id: 2, status: "is_scheduled" },
                { id: 1, status: "is_none" },
              ],
            },
            { date: "2027-02-04", collections: [{ id: 2, status: "is_scheduled" }] },
          ],
        },
      ],
    },
  ],
};

describe("garbage pickup data", () => {
  it("builds Recycle Coach's zone id from an address result", () => {
    expect(zoneString({ "prompt-1": "z5503", "prompt-2": 7121 })).toBe("zone-z5503-z7121");
    expect(
      trimLookup({
        results: [
          { address: "20338 65 AVE", zones: { p1: "z5503" } },
          { address: "20338 65 AVE", zones: { p1: "z5503" } },
          { address: "NOWHERE", zones: {} },
        ],
      }),
    ).toEqual([{ address: "20338 65 AVE", zoneId: "zone-z5503" }]);
  });

  it("tells the bins apart by name", () => {
    expect(binKind("Garbage")).toBe("garbage");
    expect(binKind("Blue Box Recycling")).toBe("recycling");
    expect(binKind("Green Cart")).toBe("organics");
    expect(binKind("Yard Waste")).toBe("organics");
    expect(binKind("Glass Depot")).toBe("glass");
    expect(binKind("Large item pickup")).toBe("other");
  });

  it("lists upcoming pickups, skipping cancelled ones and anything past or too far out", () => {
    expect(trimSchedule(collections, schedules, "2026-11-17", 57, 1)).toEqual({
      updatedAt: 1,
      configured: true,
      pickups: [
        {
          date: "2026-11-19",
          bins: [
            { name: "Green Cart", kind: "organics" },
            { name: "Garbage", kind: "garbage" },
          ],
        },
        { date: "2026-11-26", bins: [{ name: "Recycling", kind: "recycling" }] },
      ],
    });
  });

  it("refuses a malformed schedule rather than drawing junk", () => {
    expect(() => trimSchedule(collections, { nope: true }, "2026-11-17", 57, 1)).toThrow();
  });
});

describe("garbage pickup routes", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("says when no address has been picked", async () => {
    const r = await garbageFeed(defaultConfig());
    expect(r.value).toMatchObject({ configured: false, pickups: [] });
  });

  it("fetches the zone's schedule for displays, trying the other region when the first fails", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://ca-web.")) return Promise.resolve(new Response("nope", { status: 404 }));
        if (url.includes("/zone/collections")) return Promise.resolve(Response.json(collections));
        if (url.includes("/zone/schedules")) return Promise.resolve(Response.json(schedules));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.integrations.garbage.zoneId = "zone-z5503";
    await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);

    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/garbage/", { headers: { "x-display-token": token } }));
    const data = (await r.json()) as GarbageData;
    expect(data.configured).toBe(true);
    expect(seen.some((u) => u.includes("project_id=521") && u.includes("district_id=LANGL") && u.includes("zone_id=zone-z5503"))).toBe(
      true,
    );
    expect(seen.some((u) => u.startsWith("https://us-web."))).toBe(true);
  });

  it("looks up an address for admins only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ results: [{ address: "20338 65 AVE", zones: { p: "z5503" } }] }))),
    );
    const url = "/api/admin/garbage/?address=20338%2065%20Ave&projectId=521&districtId=LANGL";
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req(url, { headers: { cookie: kid } }))).status).toBe(401);
    const admin = await cookieFor("admin@example.com");
    const r = await adminGET(req(url, { headers: { cookie: admin } }));
    expect(await r.json()).toEqual({ matches: [{ address: "20338 65 AVE", zoneId: "zone-z5503" }] });
  });
});
