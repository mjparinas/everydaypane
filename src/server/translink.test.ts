import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/transit/route";
import { GET as adminGET } from "@/app/api/household/transit/route";
import { defaultConfig } from "@/lib/config/defaults";
import { newWidget } from "@/lib/config/widgets";
import type { TransitData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { decodeTripUpdates, parseCsv, readZipFiles, type ZipSource } from "./gtfs";
import { buildPack, cleanHeadsign, departures, findStops, REALTIME_URL, STATIC_URL, transitFeed } from "./translink";

// ---- A tiny protobuf writer, to build GTFS-realtime feeds the way TransLink sends them ----

function varint(n: number): number[] {
  // Negative int32s go out as ten-byte two's complement, as protobuf encoders write them.
  let v = n < 0 ? BigInt.asUintN(64, BigInt(n)) : BigInt(n);
  const out: number[] = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
}
const key = (field: number, type: number) => varint(field * 8 + type);
const int = (field: number, n: number) => [...key(field, 0), ...varint(n)];
const str = (field: number, s: string) => msg(field, [...new TextEncoder().encode(s)]);
const msg = (field: number, bytes: number[]) => [...key(field, 2), ...varint(bytes.length), ...bytes];

const NOW = 1_795_000_000; // epoch seconds: 2026-11-18T11:06:40Z

interface TestStop {
  stop: string;
  dep?: number;
  arr?: number;
  delay?: number;
  skipped?: boolean;
}
function tripUpdate(trip: { id: string; route: string; dir?: number; canceled?: boolean; vehicle?: boolean }, stops: TestStop[]) {
  const descriptor = [
    ...str(1, trip.id),
    ...str(3, "20261119"),
    ...(trip.canceled ? int(4, 3) : []),
    ...str(5, trip.route),
    ...(trip.dir === undefined ? [] : int(6, trip.dir)),
  ];
  const updates = stops.flatMap((s, i) =>
    msg(2, [
      ...int(1, i + 1),
      ...(s.arr === undefined ? [] : msg(2, [...int(1, s.delay ?? 0), ...int(2, s.arr)])),
      ...(s.dep === undefined ? [] : msg(3, [...(s.delay === undefined ? [] : int(1, s.delay)), ...int(2, s.dep)])),
      ...str(4, s.stop),
      ...(s.skipped ? int(5, 1) : []),
    ]),
  );
  return [...msg(1, descriptor), ...updates, ...(trip.vehicle ? msg(3, [...str(1, "bus-9")]) : []), ...int(4, NOW)];
}
function feed(...trips: number[][]): Uint8Array<ArrayBuffer> {
  const header = msg(1, [...str(1, "2.0"), ...int(3, NOW)]);
  // A fixed64 and a fixed32 field the decoder must skip over.
  const extras = [...key(99, 1), 1, 2, 3, 4, 5, 6, 7, 8, ...key(98, 5), 1, 2, 3, 4];
  return new Uint8Array([...header, ...extras, ...trips.flatMap((t, i) => msg(2, [...str(1, `e${i}`), ...msg(3, t)]))]);
}

const sample = () =>
  feed(
    tripUpdate({ id: "T1", route: "6612", dir: 0, vehicle: true }, [
      { stop: "100", dep: NOW + 300, delay: 180 },
      { stop: "200", dep: NOW + 900, delay: 180 },
    ]),
    tripUpdate({ id: "T2", route: "6612", dir: 0 }, [{ stop: "100", arr: NOW + 1500, delay: -90 }]),
    tripUpdate({ id: "T3", route: "6613", dir: 1 }, [{ stop: "100", dep: NOW + 600, skipped: true }]),
    tripUpdate({ id: "T4", route: "6613", canceled: true }, [{ stop: "100", dep: NOW + 700 }]),
    tripUpdate({ id: "T5", route: "6613", dir: 1, vehicle: true }, [{ stop: "300", dep: NOW + 60 }]),
    tripUpdate({ id: "T6", route: "6612", dir: 0 }, [{ stop: "100", dep: NOW + 3 * 3600 }]),
  );

// ---- A tiny zip writer (stored and deflated entries, as GTFS zips come) ----

function zip(files: Record<string, string>, deflate = true): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const le32 = (n: number) => [...le16(n & 0xffff), ...le16(n >>> 16)];
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = [...enc.encode(name)];
    const offset = locals.length;
    const common = [
      ...le16(20),
      ...le16(0),
      ...le16(deflate ? 8 : 0),
      ...le16(0),
      ...le16(0),
      ...le32(0),
      ...le32(data.length),
      ...le32(raw.length),
    ];
    locals.push(...le32(0x04034b50), ...common, ...le16(nameBytes.length), ...le16(3), ...nameBytes, 0, 0, 0, ...data);
    central.push(...le32(0x02014b50), ...le16(20), ...common, ...le16(nameBytes.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0));
    central.push(...le32(0), ...le32(offset), ...nameBytes);
  }
  const count = Object.keys(files).length;
  const eocd = [...le32(0x06054b50), 0, 0, 0, 0, ...le16(count), ...le16(count), ...le32(central.length), ...le32(locals.length), 0, 0];
  return new Uint8Array([...locals, ...central, ...eocd]);
}
const source = (buf: Uint8Array): ZipSource => ({ size: buf.length, read: (a, b) => Promise.resolve(buf.subarray(a, b)) });

const GTFS = {
  "routes.txt":
    "route_id,agency_id,route_short_name,route_long_name,route_type\n6612,1,502,Langley Centre/Surrey Central,3\n6613,1,503,Fraser Hwy Express,3\n",
  "trips.txt":
    '﻿route_id,service_id,trip_id,trip_headsign,direction_id\n6612,1,T1,502 Langley Centre,0\n6612,1,T9,502 Langley Centre,0\n6613,1,T5,"503 Aldergrove, Exchange",1\n',
  "stops.txt":
    "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type\r\n100,55210,Fraser Hwy @ 200 St,49.1050,-122.6600,0\r\n200,55211,Langley Centre Bay 4,49.1030,-122.6560,\r\n300,61234,Willowbrook Mall,49.1150,-122.6700,0\r\n9,,Langley Centre Station,49.1,-122.6,1\r\n",
  "stop_times.txt": "trip_id,arrival_time\nT1,12:00:00\n",
};

describe("GTFS pieces", () => {
  it("reads quoted CSV, a byte-order mark and Windows line endings", () => {
    expect(parseCsv('﻿a,b\r\n1,"two, ""2"""\r\n\r\n3,\n')).toEqual([
      { a: "1", b: 'two, "2"' },
      { a: "3", b: "" },
    ]);
  });

  it("reads only the asked-for files from a zip, deflated or stored", async () => {
    for (const deflate of [true, false]) {
      const files = await readZipFiles(source(zip(GTFS, deflate)), ["routes.txt", "stops.txt"]);
      expect([...files.keys()].sort()).toEqual(["routes.txt", "stops.txt"]);
      expect(files.get("routes.txt")).toBe(GTFS["routes.txt"]);
    }
    await expect(readZipFiles(source(new Uint8Array(40)), ["a"])).rejects.toThrow("Not a zip");
  });

  it("decodes trip updates, keeping only the stops asked for", () => {
    const trips = decodeTripUpdates(sample(), new Set(["100"]));
    expect(trips.map((t) => t.tripId)).toEqual(["T1", "T2", "T4", "T6"]);
    expect(trips[0]).toEqual({
      tripId: "T1",
      routeId: "6612",
      directionId: 0,
      canceled: false,
      hasVehicle: true,
      stops: [{ stopId: "100", time: NOW + 300, delay: 180 }],
    });
    // Arrival only, running early (a negative int32 on the wire).
    expect(trips[1]?.stops).toEqual([{ stopId: "100", time: NOW + 1500, delay: -90 }]);
    expect(trips[2]?.canceled).toBe(true);
  });
});

describe("TransLink departures", () => {
  const pack = () => buildPack(new Map(Object.entries(GTFS)));

  it("names routes and headsigns from the static timetable", () => {
    const p = pack();
    expect(p.routes).toEqual({ "6612": "502", "6613": "503" });
    expect(p.headsigns).toEqual(["Langley Centre", "Aldergrove, Exchange"]);
    expect(p.byDirection).toEqual({ "6612:0": 0, "6613:1": 1 });
    expect(p.stops.map((s) => s[1])).toEqual(["55210", "55211", "61234"]);
    expect(cleanHeadsign("R1 King George  Blvd", "R1")).toBe("King George Blvd");
    expect(cleanHeadsign("Langley Centre", "502")).toBe("Langley Centre");
  });

  it("lists each stop's next departures, soonest first, without skipped, cancelled or far-off trips", () => {
    const stops = new Set(["100", "300", "400"]);
    const out = departures(decodeTripUpdates(sample(), stops), pack(), stops, NOW);
    expect(out["100"]).toEqual([
      { route: "502", headsign: "Langley Centre", time: NOW + 300, delay: 180, live: true },
      // T2 isn't in trips.txt (a newer timetable): its headsign comes from its route and direction.
      { route: "502", headsign: "Langley Centre", time: NOW + 1500, delay: -90, live: false },
    ]);
    expect(out["300"]).toEqual([{ route: "503", headsign: "Aldergrove, Exchange", time: NOW + 60, delay: null, live: true }]);
    expect(out["400"]).toEqual([]);
  });

  it("finds stops by number, by name, or nearest home", () => {
    const home = { latitude: 49.104, longitude: -122.659 };
    expect(findStops(pack(), "5521", home).map((s) => s.code)).toEqual(["55210", "55211"]);
    expect(findStops(pack(), "55211", home)[0]?.code).toBe("55211");
    expect(findStops(pack(), "willowbrook", home).map((s) => s.id)).toEqual(["300"]);
    expect(findStops(pack(), "", home, 2).map((s) => s.id)).toEqual(["100", "200"]);
  });
});

describe("TransLink routes", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  const transitWidget = () => ({
    ...newWidget("transit", "bus", { x: 0, y: 0 }),
    stops: [{ id: "100", code: "55210", name: "Fraser Hwy @ 200 St" }],
  });

  /** TransLink as the server sees it: range requests on the static zip, the realtime feed behind the key. */
  function stubTransLink(seen: string[] = []) {
    const gtfs = zip(GTFS);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith(REALTIME_URL)) {
          if (!url.includes("apikey=test-key")) return Promise.resolve(new Response("no", { status: 403 }));
          return Promise.resolve(new Response(sample()));
        }
        if (url === STATIC_URL) {
          const range = new Headers(init?.headers).get("range") ?? "";
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          if (!m) return Promise.resolve(new Response(gtfs));
          const start = m[1] ? Number(m[1]) : Math.max(0, gtfs.length - Number(m[2]));
          const end = m[1] && m[2] ? Number(m[2]) + 1 : gtfs.length;
          return Promise.resolve(
            new Response(gtfs.subarray(start, end), {
              status: 206,
              headers: { "content-range": `bytes ${start}-${end - 1}/${gtfs.length}` },
            }),
          );
        }
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
  }

  it("says when no API key is set, without calling TransLink", async () => {
    const seen: string[] = [];
    stubTransLink(seen);
    const r = await transitFeed(defaultConfig());
    expect(r.value).toMatchObject({ configured: false, stops: {} });
    expect(seen).toEqual([]);
  });

  it("serves the stops on widgets to displays, sharing one read of the feed", async () => {
    vi.stubEnv("TRANSLINK_API_KEY", "test-key");
    vi.useFakeTimers({ now: NOW * 1000, toFake: ["Date"] });
    const seen: string[] = [];
    stubTransLink(seen);
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.views[0]?.widgets.splice(0, config.views[0].widgets.length, transitWidget());
    await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);

    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const get = () => displayGET(req("/api/display/transit/", { headers: { "x-display-token": token } }));
    const data = (await (await get()).json()) as TransitData;
    expect(data.configured).toBe(true);
    expect(Object.keys(data.stops)).toEqual(["100"]);
    expect(data.stops["100"]?.map((d) => [d.route, d.time - NOW])).toEqual([
      ["502", 300],
      ["502", 1500],
    ]);
    await get();
    expect(seen.filter((u) => u.startsWith(REALTIME_URL))).toHaveLength(1);
    // Only the tail and the three small files of the static zip were downloaded, never stop_times.txt.
    expect(seen.filter((u) => u === STATIC_URL).length).toBeLessThanOrEqual(7);
    expect((await displayGET(req("/api/display/transit/"))).status).toBe(401);
    vi.useRealTimers();
  });

  it("reports a refused key as unavailable, never echoing the key", async () => {
    vi.stubEnv("TRANSLINK_API_KEY", "wrong-key");
    stubTransLink();
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.views[0]?.widgets.splice(0, config.views[0].widgets.length, transitWidget());
    await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/transit/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("wrong-key");
  });

  it("searches stops for admins only", async () => {
    stubTransLink();
    expect((await adminGET(req("/api/household/transit/?q=55210"))).status).toBe(401);
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/household/transit/?q=55210", { headers: { cookie: kid } }))).status).toBe(401);
    const cookie = await cookieFor("admin@example.com");
    const body = (await (await adminGET(req("/api/household/transit/?q=55210", { headers: { cookie } }))).json()) as {
      keySet: boolean;
      stops: { code: string }[];
    };
    expect(body.keySet).toBe(false);
    expect(body.stops.map((s) => s.code)).toEqual(["55210"]);
  });
});
