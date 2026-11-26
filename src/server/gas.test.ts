import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/display/gas/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import { gasPriceText, gasRows, type GasData, type GasStation } from "@/lib/gas";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { distanceKm, gasFeed, gasRadiusInUse, moneyValue, parseNearby } from "./gas";

// Places API (New) Nearby Search answers in the shape Google documents for Place, FuelOptions, FuelPrice and Money
// (this sandbox can't reach Google). Coordinates are real Langley stations' rough positions.
const HOME = { latitude: 49.1044, longitude: -122.6604 };
const NOW = Date.parse("2026-11-26T18:00:00Z");
const price = (type: string, units: string, nanos: number, updateTime = "2026-11-26T15:30:00Z") => ({
  type,
  price: { currencyCode: "CAD", units, nanos },
  updateTime,
});
const PLACES = {
  places: [
    {
      id: "ChIJchevron",
      displayName: { text: "Chevron", languageCode: "en" },
      shortFormattedAddress: "19651 Fraser Hwy, Langley",
      location: { latitude: 49.1045, longitude: -122.6725 },
      fuelOptions: {
        fuelPrices: [price("REGULAR_UNLEADED", "1", 619000000), price("PREMIUM", "1", 919000000), price("DIESEL", "1", 739000000)],
      },
    },
    {
      id: "ChIJcostco",
      displayName: { text: "Costco Gas" },
      formattedAddress: "20499 64 Ave, Langley, BC V2Y 1N5, Canada",
      location: { latitude: 49.1167, longitude: -122.6597 },
      fuelOptions: { fuelPrices: [price("REGULAR_UNLEADED", "1", 549000000), price("SP95", "1", 1)] },
    },
    // A station Google has no prices for, and one whose only price can't be read: both dropped.
    { id: "ChIJnoprice", displayName: { text: "Husky" }, location: { latitude: 49.1, longitude: -122.66 } },
    { id: "ChIJbad", displayName: { text: "Mobil" }, fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { units: "x" } }] } },
  ],
};

function withGas(radii: number[]): DashboardConfig {
  const c = defaultConfig();
  c.location = { ...c.location, ...HOME };
  c.views[0]!.widgets = radii.map((radiusKm, i) => ({ ...newWidget("gasPrices", `g${i}`, { x: 0, y: i * 3 }), radiusKm }));
  return c;
}

function stubGoogle(answer: () => Response = () => Response.json(PLACES)) {
  const fetch = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => answer());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("gas prices from Google Places", () => {
  it("reads Money as a number", () => {
    expect(moneyValue({ currencyCode: "CAD", units: "1", nanos: 659000000 })).toEqual({ value: 1.659, currency: "CAD" });
    expect(moneyValue({ currencyCode: "usd", units: 3, nanos: 450000000 })).toEqual({ value: 3.45, currency: "USD" });
    expect(moneyValue({ nanos: 999000000 }).value).toBeCloseTo(0.999);
    expect(moneyValue({ units: "x" }).value).toBeNaN();
  });

  it("keeps stations with prices, nearest first, with our fuel names and the distance from home", () => {
    const stations = parseNearby(PLACES, HOME);
    expect(stations.map((s) => s.name)).toEqual(["Chevron", "Costco Gas"]);
    expect(stations[0]).toEqual({
      id: "ChIJchevron",
      name: "Chevron",
      address: "19651 Fraser Hwy, Langley",
      km: 0.9,
      currency: "CAD",
      prices: {
        regular: { price: 1.619, at: Date.parse("2026-11-26T15:30:00Z") },
        premium: { price: 1.919, at: Date.parse("2026-11-26T15:30:00Z") },
        diesel: { price: 1.739, at: Date.parse("2026-11-26T15:30:00Z") },
      },
    });
    // REGULAR_UNLEADED beats the looser SP95 for regular; SP95 still counts as mid-grade.
    expect(stations[1]!.prices.regular?.price).toBe(1.549);
    expect(stations[1]!.prices.midgrade?.price).toBeCloseTo(1);
    expect(stations[1]!.address).toBe("20499 64 Ave, Langley");
    expect(parseNearby({}, HOME)).toEqual([]);
    expect(() => parseNearby({ places: "busy" }, HOME)).toThrow();
  });

  it("measures distance on the globe", () => {
    expect(distanceKm(HOME, HOME)).toBe(0);
    expect(distanceKm(HOME, { latitude: 49.2827, longitude: -123.1207 })).toBeCloseTo(38.5, 0); // downtown Vancouver
  });

  it("asks for the farthest radius any gas widget wants", () => {
    expect(gasRadiusInUse(withGas([3, 8]))).toBe(8);
    expect(gasRadiusInUse(defaultConfig())).toBe(0);
  });
});

describe("what a gas widget shows", () => {
  const at = NOW - 3_600_000;
  const station = (id: string, km: number, regular: number | null, priceAt = at): GasStation => ({
    id,
    name: id,
    address: "",
    km,
    currency: "CAD",
    prices: regular === null ? {} : { regular: { price: regular, at: priceAt } },
  });
  const all = [
    station("near", 0.5, 1.659),
    station("cheap", 3, 1.549),
    station("far", 9, 1.499),
    station("none", 1, null),
    station("old", 1, 1.399, NOW - 4 * 86_400_000),
  ];

  it("keeps the radius, the fuel and fresh prices, cheapest or nearest first", () => {
    const opts = { fuel: "regular" as const, radiusKm: 5, count: 4 };
    expect(gasRows(all, { ...opts, sort: "price" }, NOW).map((r) => r.station.id)).toEqual(["cheap", "near"]);
    expect(gasRows(all, { ...opts, sort: "distance" }, NOW).map((r) => r.station.id)).toEqual(["near", "cheap"]);
    expect(gasRows(all, { ...opts, radiusKm: 10, count: 1, sort: "price" }, NOW).map((r) => r.station.id)).toEqual(["far"]);
    expect(gasRows(all, { ...opts, fuel: "diesel", sort: "price" }, NOW)).toEqual([]);
  });

  it("writes Canadian prices in cents a litre", () => {
    expect(gasPriceText(1.659, "CAD")).toBe("165.9¢");
    expect(gasPriceText(1.6, "CAD")).toBe("160.0¢");
    expect(gasPriceText(3.449, "USD")).toBe("$3.45");
    expect(gasPriceText(1.8, "EUR")).toBe("1.800 EUR");
  });
});

describe("gas route", () => {
  useTestServer({});
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearMemoryCache();
  });

  it("says the key is missing and never calls Google without one", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const fetch = stubGoogle();
    expect(await gasFeed("a", withGas([5]), NOW)).toMatchObject({ missing: "key", stations: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks Google once per two hours with the key in a header, and serves the last good list when it fails", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetch = stubGoogle();
    expect(await gasFeed("a", defaultConfig(), NOW)).toMatchObject({ stations: [] });
    expect(fetch).not.toHaveBeenCalled();

    const config = withGas([3, 8]);
    const first = await gasFeed("a", config, NOW);
    expect(first).toMatchObject({ missing: "", radiusKm: 8, updatedAt: NOW });
    expect(first.stations).toHaveLength(2);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(String(url)).not.toContain("test-key");
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.fuelOptions");
    expect(JSON.parse(String(init!.body))).toMatchObject({
      includedTypes: ["gas_station"],
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: HOME, radius: 8000 } },
    });

    await gasFeed("a", config, NOW + 60 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Another household's wall reads for itself: Places content isn't shared between households.
    await gasFeed("b", config, NOW + 60 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockImplementation(async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }));
    const later = await gasFeed("a", config, NOW + 3 * 3_600_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(later.stations).toHaveLength(2);
    expect(later.updatedAt).toBe(NOW);

    clearMemoryCache();
    const fresh = await gasFeed("c", config, NOW);
    expect(fresh).toMatchObject({ stations: [], error: "Google answered 429 (RESOURCE_EXHAUSTED)" });
  });

  it("answers displays only", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    stubGoogle();
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const c = structuredClone(stored.config);
    c.views[0]!.widgets = withGas([5]).views[0]!.widgets;
    await saveConfig(LEGACY_ACCOUNT_ID, c, stored.version);
    expect((await GET(req("/api/display/gas/"))).status).toBe(401);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await GET(req("/api/display/gas/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as GasData;
    expect(data.stations.map((s) => s.name)).toEqual(["Chevron", "Costco Gas"]);
  });
});
