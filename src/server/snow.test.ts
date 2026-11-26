import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import { mountainById, snowAmount, weekday, type MountainId } from "@/lib/snow";
import { useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { mountainsInUse, parseSnow, snowFeed, snowUrl } from "./snow";

// 2026-11-25 12:30 in Vancouver (UTC−7 since B.C.'s 2026 change).
const NOW = Date.parse("2026-11-25T19:30:00Z");
const OFFSET = -7 * 3600;
const START = Date.parse("2026-11-24T07:00:00Z") / 1000; // local midnight, Nov 24

/** One Open-Meteo location shaped like its documented unixtime answer: 1 cm of snow an hour, depth growing 1 cm an hour. */
function location(temperature: number) {
  const hours = Array.from({ length: 96 }, (_, i) => START + i * 3600);
  return {
    utc_offset_seconds: OFFSET,
    current: { time: NOW / 1000, temperature_2m: temperature },
    hourly: { time: hours, snowfall: hours.map(() => 1), snow_depth: hours.map((_, i) => 0.5 + i * 0.01) },
    daily: { time: [0, 1, 2, 3].map((d) => START + d * 86_400), snowfall_sum: [24, 12.34, 7, 0] },
  };
}

function withSnow(...lists: MountainId[][]): DashboardConfig {
  const c = defaultConfig();
  c.views[0]!.widgets = lists.map((mountains, i) => ({ ...newWidget("snow", `sn${i}`, { x: 0, y: i * 3 }), mountains }));
  return c;
}

describe("snow report", () => {
  const whistler = mountainById("whistler")!;
  const cypress = mountainById("cypress")!;

  it("adds up the last 24 hours, takes the latest depth, and keeps today and the next two days", () => {
    const [w] = parseSnow([whistler], location(-6.5), NOW);
    expect(w).toEqual({
      id: "whistler",
      name: "Whistler",
      newSnow: 24,
      // Latest past stamp is 19:00Z on Nov 25, hour 36: 0.5 m + 0.36 m.
      depth: 86,
      temperature: -6.5,
      forecast: [
        { day: "2026-11-25", snow: 12.3 },
        { day: "2026-11-26", snow: 7 },
        { day: "2026-11-27", snow: 0 },
      ],
    });
  });

  it("reads Open-Meteo's array for several mountains and keeps a bad entry from hiding the rest", () => {
    const rows = parseSnow([cypress, whistler], [{ error: true }, location(-3)], NOW);
    expect(rows[0]).toEqual({ id: "cypress", name: "Cypress", forecast: [] });
    expect(rows[1]).toMatchObject({ id: "whistler", newSnow: 24 });
  });

  it("asks for every picked mountain once, at its elevation", () => {
    const c = withSnow(["whistler", "cypress"], ["cypress", "baker"]);
    expect(mountainsInUse(c).map((m) => m.id)).toEqual(["whistler", "cypress", "baker"]);
    expect(mountainsInUse(defaultConfig())).toEqual([]);
    const url = new URL(snowUrl(mountainsInUse(c), "America/Vancouver"));
    expect(url.searchParams.get("latitude")).toBe("50.066,49.396,48.857");
    expect(url.searchParams.get("elevation")).toBe("1800,1200,1300");
    expect(url.searchParams.get("hourly")).toBe("snowfall,snow_depth");
  });

  it("formats amounts in centimetres or inches", () => {
    expect(snowAmount(23.6, "cm")).toBe("24");
    expect(snowAmount(12.7, "in")).toBe("5");
    expect(snowAmount(10.16, "in")).toBe("4");
    expect(snowAmount(254, "in")).toBe("100");
    expect(weekday("2026-11-26")).toBe("Thu");
  });
});

describe("snow feed", () => {
  useTestServer({});
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("reads Open-Meteo once for every display and converts the temperature for imperial dashboards", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json([location(-5), location(0)])));
    vi.stubGlobal("fetch", fetch);
    const c = withSnow(["cypress", "whistler"]);
    const metric = await snowFeed(c, NOW);
    expect(metric).toMatchObject({ unit: "cm", stale: false });
    expect(metric.mountains.map((m) => m.temperature)).toEqual([-5, 0]);
    c.units = "imperial";
    const imperial = await snowFeed(c, NOW + 60_000);
    expect(imperial.unit).toBe("in");
    expect(imperial.mountains.map((m) => m.temperature)).toEqual([23, 32]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("says so when Open-Meteo has never answered, and reads nothing without a snow widget", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("busy", { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    expect(await snowFeed(withSnow(["grouse"]), NOW)).toMatchObject({ mountains: [], error: "Snow report unavailable" });
    expect(await snowFeed(defaultConfig(), NOW)).toMatchObject({ mountains: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
