import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as frameGET } from "@/app/api/display/radar/frame/route";
import { GET as feedGET } from "@/app/api/display/radar/route";
import { GET as tileGET } from "@/app/api/display/radar/tile/route";
import { defaultConfig } from "@/lib/config/defaults";
import { newWidget } from "@/lib/config/widgets";
import type { RadarData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { dimensionFrom, durationMs, frameUrl, parseTimes, radarFeed, radarMap, radarTimes } from "./radar";

// GeoMet's GetCapabilities filtered to one layer, trimmed to the parts we read (this sandbox can't reach GeoMet; the
// shape follows MSC's WMS documentation).
const capabilities = (dimension: string) => `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Capability><Layer><Layer queryable="1">
    <Name>RADAR_1KM_RRAI</Name>
    <Dimension name="time" units="ISO8601" default="2026-11-21T05:00:00Z" nearestValue="0">${dimension}</Dimension>
  </Layer></Layer></Capability>
</WMS_Capabilities>`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const NOW = Date.parse("2026-11-21T05:03:00Z");
const at = (hhmm: string) => Date.parse(`2026-11-21T${hhmm}:00Z`);

/** GeoMet with radar every six minutes until 05:00 and an extrapolation every ten minutes to 08:00. */
function geomet(opts: { forecast?: boolean; picture?: Uint8Array<ArrayBuffer> | string } = {}) {
  const seen: string[] = [];
  const fetch = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    const q = new URL(url).searchParams;
    if (q.get("request") === "GetCapabilities") {
      const layer = q.get("layer") ?? "";
      if (layer.includes("Extrapolation")) {
        return Promise.resolve(
          opts.forecast === false
            ? new Response("down", { status: 503 })
            : new Response(capabilities("2026-11-21T05:00:00Z/2026-11-21T08:00:00Z/PT10M")),
        );
      }
      return Promise.resolve(new Response(capabilities("2026-11-21T02:00:00Z/2026-11-21T05:00:00Z/PT6M")));
    }
    return Promise.resolve(new Response(opts.picture ?? PNG));
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, seen };
}

describe("radar times", () => {
  it("reads ISO 8601 durations", () => {
    expect(durationMs("PT6M")).toBe(360_000);
    expect(durationMs("PT1H")).toBe(3_600_000);
    expect(durationMs("P1DT30S")).toBe(86_430_000);
    expect(durationMs("six minutes")).toBe(0);
  });

  it("lists the times of an interval, a list, or both", () => {
    expect(parseTimes("2026-11-21T04:48:00Z/2026-11-21T05:00:00Z/PT6M")).toEqual([at("04:48"), at("04:54"), at("05:00")]);
    expect(parseTimes("2026-11-21T05:00:00Z,2026-11-21T04:50:00Z")).toEqual([at("04:50"), at("05:00")]);
    expect(parseTimes("nonsense/2026-11-21T05:00:00Z/PT6M")).toEqual([]);
  });

  it("keeps only the latest few hundred times of a long interval", () => {
    const times = parseTimes("2020-01-01T00:00:00Z/2026-11-21T05:00:00Z/PT6M");
    expect(times).toHaveLength(400);
    expect(times.at(-1)).toBe(at("05:00"));
  });

  it("finds the time dimension in the capabilities, and says when there is none", () => {
    expect(dimensionFrom(capabilities("2026-11-21T05:00:00Z"))).toBe("2026-11-21T05:00:00Z");
    expect(() => dimensionFrom("<ServiceExceptionReport>Unknown layer</ServiceExceptionReport>")).toThrow("no radar times");
  });
});

describe("radar feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("lists the last three hours observed and the forecast after the latest picture", async () => {
    geomet();
    const t = await radarTimes("rain", NOW);
    expect(t.past).toHaveLength(30); // 02:06 to 05:00 (02:00 is more than three hours ago)
    expect(t.past.at(-1)).toBe(at("05:00"));
    expect(t.forecast[0]).toBe(at("05:10"));
    expect(t.forecast.at(-1)).toBe(at("08:00"));
  });

  it("still shows the observed radar when the forecast is down", async () => {
    geomet({ forecast: false });
    const t = await radarTimes("rain", NOW);
    expect(t.past.at(-1)).toBe(at("05:00"));
    expect(t.forecast).toEqual([]);
    expect(t.error).toBeUndefined();
  });

  it("asks GeoMet for the times at most every two minutes", async () => {
    const { fetch } = geomet();
    await radarTimes("rain", NOW);
    await radarTimes("rain", NOW + 60_000);
    expect(fetch).toHaveBeenCalledTimes(2); // observed and forecast, once each
  });

  it("maps only what the widgets use, and gives displays tiles and pixels, not coordinates", async () => {
    geomet();
    const config = defaultConfig();
    config.views[0]!.widgets = [
      { ...newWidget("radar", "r1", { x: 0, y: 0 }), precip: "snow", zoom: 9 },
      { ...newWidget("radar", "r2", { x: 4, y: 0 }), precip: "snow", zoom: 7 },
    ];
    const data = await radarFeed(config, NOW);
    expect(Object.keys(data.layers)).toEqual(["snow"]);
    expect(Object.keys(data.maps).sort()).toEqual(["7", "9"]);
    expect(JSON.stringify(data)).not.toContain("49.1");
  });

  it("puts home in the middle tile of the map", () => {
    // Langley (49.1044, −122.6604) is tile 40, 87 at zoom 8.
    expect(radarMap(defaultConfig(), 8)).toEqual({ x: 38, y: 85, homeX: 710, homeY: 718 });
  });

  it("asks for radar pictures of exactly the map's area, in map projection", () => {
    const url = new URL(frameUrl(defaultConfig(), "rain", "forecast", 8, at("05:30")));
    expect(url.host).toBe("geo.weather.gc.ca");
    expect(url.searchParams.get("LAYERS")).toBe("Radar_1km_RainPrecipRate-Extrapolation");
    expect(url.searchParams.get("CRS")).toBe("EPSG:3857");
    expect(url.searchParams.get("BBOX")).toBe("-14088873.05,5948635.29,-13306157.88,6731350.46");
    expect(url.searchParams.get("WIDTH")).toBe("640");
    expect(url.searchParams.get("TIME")).toBe("2026-11-21T05:30:00Z");
  });

  it("serves displays the picture times, with their token only", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    geomet();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await feedGET(req("/api/display/radar/", { headers: { "x-display-token": token } }));
    const data = (await r.json()) as RadarData;
    expect(data.layers.rain?.past.at(-1)).toBe(at("05:00"));
    expect(data.maps["8"]).toEqual({ x: 38, y: 85, homeX: 710, homeY: 718 });
    expect((await feedGET(req("/api/display/radar/"))).status).toBe(401);
    vi.useRealTimers();
  });

  it("passes on pictures for listed times only, and keeps observed ones a day", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { seen } = geomet();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const frame = (q: string) => frameGET(req(`/api/display/radar/frame/?t=${token}&${q}`));
    const past = await frame(`p=rain&z=8&time=${at("04:54")}`);
    expect(past.status).toBe(200);
    expect(past.headers.get("content-type")).toBe("image/png");
    expect(past.headers.get("cache-control")).toContain("max-age=86400");
    const ahead = await frame(`p=rain&z=8&time=${at("05:40")}`);
    expect(ahead.headers.get("cache-control")).toBe("private, max-age=300");
    expect(seen.filter((u) => u.includes("GetMap")).map((u) => new URL(u).searchParams.get("LAYERS"))).toEqual([
      "RADAR_1KM_RRAI",
      "Radar_1km_RainPrecipRate-Extrapolation",
    ]);
    expect((await frame(`p=rain&z=8&time=${at("04:55")}`)).status).toBe(404); // not a listed time
    expect((await frame(`p=rain&z=12&time=${at("04:54")}`)).status).toBe(404);
    expect((await frame(`p=hail&z=8&time=${at("04:54")}`)).status).toBe(404);
    expect((await frameGET(req(`/api/display/radar/frame/?p=rain&z=8&time=${at("04:54")}`))).status).toBe(401);
    vi.useRealTimers();
  });

  it("never passes on GeoMet's error answers as pictures", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    geomet({ picture: '<?xml version="1.0"?><ServiceExceptionReport/>' });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    expect((await frameGET(req(`/api/display/radar/frame/?t=${token}&p=rain&z=8&time=${at("04:54")}`))).status).toBe(404);
    vi.useRealTimers();
  });

  it("serves Esri's map tiles around home only, row before column", async () => {
    const { seen } = geomet({ picture: JPEG });
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const tile = (q: string) => tileGET(req(`/api/display/radar/tile/?t=${token}&${q}`));
    const ok = await tile("s=dark&z=8&x=40&y=87");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=604800");
    expect(seen.at(-1)).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/8/87/40");
    expect((await tile("s=light-labels&z=8&x=42&y=89")).status).toBe(200); // the map's far corner
    expect(seen.at(-1)).toContain("/World_Light_Gray_Reference/MapServer/tile/8/89/42");
    expect((await tile("s=light&z=8&x=43&y=87")).status).toBe(404); // off the map
    expect((await tile("s=satellite&z=8&x=40&y=87")).status).toBe(404);
    expect((await tile("s=constructor&z=8&x=40&y=87")).status).toBe(404);
    expect((await tile("s=light&z=5&x=5&y=10")).status).toBe(404);
  });

  it("never passes on a page in place of a map tile", async () => {
    geomet({ picture: "<html>Sign in for an API key</html>" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    expect((await tileGET(req(`/api/display/radar/tile/?t=${token}&s=light&z=8&x=40&y=87`))).status).toBe(404);
  });
});
