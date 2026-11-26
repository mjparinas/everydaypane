import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/display/border/route";
import type { BorderCrossing } from "@/lib/border";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { BorderData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { borderFeed, cbpTime, cbsaTime, cbsaWait, crossingsInUse, parseCbp, parseCbsa } from "./border";
import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";

// CBSA's bwt-eng.csv and CBP's /api/bwtnew as read on 2026-11-26 (this sandbox can't reach either). The CBSA rows are
// copied as they were; the CBP ports keep only the fields the server reads, with the values they had.
const CBSA = [
  "﻿Customs Office;; Location;; Last updated;; Commercial Flow - Canada bound;; Commercial Flow - U.S. bound;; Travellers Flow - Canada bound;; Travellers Flow - U.S. bound;;",
  "Abbotsford-Huntingdon;; Abbotsford, BC/Sumas, WA;; 2026-11-25 14:48 PDT;; 10 minutes;; --;; 1 hour 5 minutes;; --;;",
  "Aldergrove;; Aldergrove, BC/Lynden, WA;; 2026-11-25 14:48 PDT;; No Delay;; --;; 10 minutes;; --;;",
  "Pacific Highway;; Surrey, BC/Blaine, WA;; 2026-11-25 15:00 PDT;; 5 minutes;; --;; 5 minutes;; --;;",
  "Douglas;; Surrey, BC/Blaine, WA;; 2026-11-25 15:00 PDT;; Not Applicable;; --;; No Delay;; --;;",
  "Ambassador Bridge;; Windsor, ON/Detroit, MI;; 2026-11-25 18:00 EST;; 20 minutes;; --;; 15 minutes;; --;;",
].join("\r\n");

const lane = (operational_status: string, delay_minutes = "", update_time = "At 3:00 pm PST") => ({
  update_time: operational_status === "Update Pending" ? "" : update_time,
  operational_status,
  delay_minutes,
  lanes_open: delay_minutes ? "3" : "",
});
const port = (port_number: string, crossing_name: string, standard: object, nexus: object, port_status = "Open") => ({
  port_number,
  border: "Canadian Border",
  port_name: port_number === "302301" ? "Lynden" : "Blaine",
  crossing_name,
  date: "11/25/2026",
  time: "15:59:55",
  port_status,
  passenger_vehicle_lanes: { maximum_lanes: "7", standard_lanes: standard, NEXUS_SENTRI_lanes: nexus, ready_lanes: lane("Lanes Closed") },
});
const CBP = [
  port("300401", "Pacific Highway", lane("delay", "20"), lane("no delay", "0")),
  port("300402", "Peace Arch", lane("delay", "30"), lane("no delay", "0")),
  port("302301", "", lane("Update Pending"), lane("Update Pending")),
  port("300901", "", lane("no delay", "0"), lane("N/A"), "Closed"),
  port("090102", "Rainbow Bridge", lane("delay", "23", "At 6:47 pm EST"), lane("N/A")),
];

// 4 PM in Langley on 2026-11-25 (3 PM PST in Blaine).
const NOW = Date.parse("2026-11-26T00:00:00Z");
const PST_3PM = Date.parse("2026-11-25T23:00:00Z");

function withBorder(crossings: BorderCrossing[]): DashboardConfig {
  const c = defaultConfig();
  c.views[0]!.widgets = [{ ...newWidget("borderWait", "bw", { x: 0, y: 0 }), crossings }];
  return c;
}

function stubBoth(cbsa: () => Response = () => new Response(CBSA), cbp: () => Response = () => Response.json(CBP)) {
  const fetch = vi.fn((url: string) => Promise.resolve(url.includes("cbsa") ? cbsa() : cbp()));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("border wait data", () => {
  it("reads CBSA's times and waits", () => {
    expect(cbsaTime("2026-11-25 15:00 PDT")).toBe(Date.parse("2026-11-25T22:00:00Z"));
    expect(cbsaTime("2026-11-25 18:00 EST")).toBe(Date.parse("2026-11-25T23:00:00Z"));
    expect(cbsaTime("soon")).toBe(0);
    expect(cbsaWait("No Delay")).toEqual({ minutes: 0, closed: false });
    expect(cbsaWait("50 minutes")).toEqual({ minutes: 50, closed: false });
    expect(cbsaWait("1 hour 5 minutes")).toEqual({ minutes: 65, closed: false });
    expect(cbsaWait("2 hours")).toEqual({ minutes: 120, closed: false });
    expect(cbsaWait("Not Applicable")).toEqual({ minutes: null, closed: false });
    expect(cbsaWait("--")).toEqual({ minutes: null, closed: false });
    expect(cbsaWait("Temporarily closed")).toEqual({ minutes: null, closed: true });
  });

  it("keeps the Canada-bound traveller column for our crossings only, finding columns by their header", () => {
    const waits = parseCbsa(CBSA);
    expect(Object.keys(waits).sort()).toEqual(["aldergrove", "huntingdon", "pacificHighway", "peaceArch"]);
    expect(waits.peaceArch).toEqual({ minutes: 0, closed: false, at: Date.parse("2026-11-25T22:00:00Z") });
    expect(waits.aldergrove).toEqual({ minutes: 10, closed: false, at: Date.parse("2026-11-25T21:48:00Z") });
    expect(waits.huntingdon?.minutes).toBe(65);
    // A plain comma file reads the same.
    expect(
      parseCbsa("Customs Office,Location,Last updated,Travellers Flow - Canada bound\nDouglas,Surrey,2026-11-25 15:00 PDT,25 minutes")
        .peaceArch?.minutes,
    ).toBe(25);
    expect(() => parseCbsa("<html>Maintenance</html>")).toThrow();
  });

  it("reads CBP's lane times, with tonight's after-midnight reading taken as yesterday's", () => {
    expect(cbpTime("At 3:00 pm PST", "11/25/2026", NOW)).toBe(PST_3PM);
    expect(cbpTime("At Noon PST", "11/25/2026", NOW)).toBe(Date.parse("2026-11-25T20:00:00Z"));
    expect(cbpTime("At 11:00 pm PST", "11/26/2026", Date.parse("2026-11-26T08:30:00Z"))).toBe(Date.parse("2026-11-26T07:00:00Z"));
    expect(cbpTime("", "11/25/2026", NOW)).toBe(0);
  });

  it("keeps the car lanes and NEXUS for our ports; pending is no reading and a closed port is closed", () => {
    const waits = parseCbp(CBP, NOW);
    expect(Object.keys(waits).sort()).toEqual(["aldergrove", "huntingdon", "pacificHighway", "peaceArch"]);
    expect(waits.peaceArch).toEqual({ minutes: 30, nexus: 0, closed: false, at: PST_3PM });
    expect(waits.pacificHighway).toEqual({ minutes: 20, nexus: 0, closed: false, at: PST_3PM });
    expect(waits.aldergrove).toEqual({ minutes: null, closed: false, at: 0 });
    expect(waits.huntingdon).toMatchObject({ minutes: null, closed: true });
    expect(() => parseCbp({ error: "busy" })).toThrow();
  });

  it("asks only for the crossings on a border widget", () => {
    expect(crossingsInUse(withBorder(["aldergrove", "peaceArch"]))).toEqual(["aldergrove", "peaceArch"]);
    expect(crossingsInUse(defaultConfig())).toEqual([]);
  });
});

describe("border route", () => {
  useTestServer({});
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("reads each agency once for every widget, and one failing never hides the other", async () => {
    const fetch = stubBoth();
    const config = withBorder(["peaceArch", "aldergrove"]);
    const first = await borderFeed(config, NOW);
    expect(first.crossings).toEqual([
      {
        id: "peaceArch",
        name: "Peace Arch",
        toUS: { minutes: 30, nexus: 0, closed: false, at: PST_3PM },
        toCanada: expect.objectContaining({ minutes: 0 }),
      },
      {
        id: "aldergrove",
        name: "Aldergrove",
        toUS: { minutes: null, closed: false, at: 0 },
        toCanada: expect.objectContaining({ minutes: 10 }),
      },
    ]);
    expect(first.down).toEqual({ cbsa: false, cbp: false });
    await borderFeed(config, NOW + 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    clearMemoryCache();
    stubBoth(
      () => new Response("down", { status: 503 }),
      () => Response.json(CBP),
    );
    // The cache table still holds CBSA's last good copy.
    const later = await borderFeed(config, NOW + 10 * 60_000);
    expect(later.down).toEqual({ cbsa: false, cbp: false });
    expect(later.crossings[0]!.toCanada?.minutes).toBe(0);
  });

  it("says which agency has never been read, and reads nothing without a border widget", async () => {
    const fetch = stubBoth(
      () => new Response("down", { status: 503 }),
      () => Response.json(CBP),
    );
    expect(await borderFeed(defaultConfig(), NOW)).toMatchObject({ crossings: [] });
    expect(fetch).not.toHaveBeenCalled();
    const d = await borderFeed(withBorder(["peaceArch"]), NOW);
    expect(d.down).toEqual({ cbsa: true, cbp: false });
    expect(d.crossings[0]).toMatchObject({ toCanada: null, toUS: { minutes: 30 } });
  });

  it("answers displays only", async () => {
    stubBoth();
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const c = structuredClone(stored.config);
    c.views[0]!.widgets = withBorder(["pacificHighway"]).views[0]!.widgets;
    await saveConfig(LEGACY_ACCOUNT_ID, c, stored.version);
    expect((await GET(req("/api/display/border/"))).status).toBe(401);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await GET(req("/api/display/border/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as BorderData;
    expect(data.crossings).toEqual([expect.objectContaining({ id: "pacificHighway", toUS: expect.objectContaining({ minutes: 20 }) })]);
  });
});
