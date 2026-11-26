import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import { GAS_FUELS, GAS_RADIUS_MAX, GOOGLE_FUEL_TYPES, type GasData, type GasFuel, type GasStation } from "@/lib/gas";

import { cached } from "./cache";
import { env } from "./env";

// Local gas prices (Melvin, 2026-11-26). Claude's pick of source, 2026-11-26: Google's Places API (New) Nearby Search,
// whose gas stations carry `fuelOptions.fuelPrices` (each fuel's last known price, as Money, with its update time).
// It is the only official, station-level source we found for Canada: GasBuddy has no public API (its site's GraphQL is
// unofficial, against its terms and behind bot protection, and we don't route around blocking), and Natural Resources
// Canada's city averages are robots-disallowed and months behind. The key is Everydaypane's own (GOOGLE_MAPS_API_KEY,
// Places API (New) switched on), sent as a header, never in a URL. Asking for fuelOptions bills the request at Google's
// "Nearby Search Enterprise + Atmosphere" rate (1,000 a month free, then about US$40 per 1,000), so each household's
// read is kept two hours and shared by all its widgets and displays: about 360 reads a month a household. Google only
// allows Places content to be kept briefly, so the cache is per household and never shared between them. Google has
// prices for stations where it has them; stations without any are dropped. This sandbox can't reach Google, so tests
// use the documented shapes.

const URL_NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const FIELDS = "places.id,places.displayName,places.shortFormattedAddress,places.formattedAddress,places.location,places.fuelOptions";
const TTL = 2 * 3_600_000;

/** The largest radius any gas widget asks for, km (0 when there is no gas widget). */
export function gasRadiusInUse(config: DashboardConfig): number {
  let km = 0;
  for (const v of config.views) for (const w of v.widgets) if (w.type === "gasPrices") km = Math.max(km, w.radiusKm);
  return Math.min(km, GAS_RADIUS_MAX);
}

/** Great-circle distance in km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Google's Money ({ currencyCode, units: "1", nanos: 659000000 }) → 1.659; NaN when it can't be read. */
export function moneyValue(m: unknown): { value: number; currency: string } {
  const o = (m ?? {}) as Record<string, unknown>;
  const units = o.units === undefined ? 0 : num(o.units);
  const nanos = o.nanos === undefined ? 0 : num(o.nanos);
  // Rounded to a millionth, so 1 + 0.739 reads 1.739 and not 1.7389999999999999.
  return { value: Math.round((units + nanos / 1e9) * 1e6) / 1e6, currency: str(o.currencyCode).toUpperCase() };
}

/** One answer from Nearby Search → stations with at least one price, nearest first. Parsed leniently. */
export function parseNearby(raw: unknown, home: { latitude: number; longitude: number }): GasStation[] {
  const places = (raw as { places?: unknown } | null)?.places;
  if (places === undefined) return [];
  if (!Array.isArray(places)) throw new Error("Google answered without a list of places");
  const out: GasStation[] = [];
  for (const p of places as Record<string, unknown>[]) {
    const fuel = (p?.fuelOptions ?? {}) as { fuelPrices?: unknown };
    if (!Array.isArray(fuel.fuelPrices)) continue;
    const best = new Map<GasFuel, { price: number; at: number; rank: number }>();
    let currency = "";
    for (const f of fuel.fuelPrices as Record<string, unknown>[]) {
      const type = str(f?.type).toUpperCase();
      const { value, currency: cur } = moneyValue(f?.price);
      if (!Number.isFinite(value) || value <= 0) continue;
      const at = Date.parse(str(f?.updateTime));
      for (const ours of GAS_FUELS) {
        const rank = GOOGLE_FUEL_TYPES[ours].indexOf(type);
        // The first name in our list wins over a looser one (REGULAR_UNLEADED over SP95 for regular).
        if (rank < 0 || (best.get(ours)?.rank ?? Infinity) <= rank) continue;
        best.set(ours, { price: value, at: Number.isFinite(at) ? at : 0, rank });
      }
      currency ||= cur;
    }
    const prices: GasStation["prices"] = {};
    for (const [k, x] of best) prices[k] = { price: x.price, at: x.at };
    if (!Object.keys(prices).length) continue;
    const loc = (p.location ?? {}) as Record<string, unknown>;
    const lat = num(loc.latitude);
    const lon = num(loc.longitude);
    const km = Number.isFinite(lat) && Number.isFinite(lon) ? distanceKm(home, { latitude: lat, longitude: lon }) : NaN;
    const name = str((p.displayName as { text?: unknown } | undefined)?.text).trim();
    out.push({
      id: str(p.id) || name,
      name: name || "Gas station",
      address: (str(p.shortFormattedAddress) || str(p.formattedAddress).split(",").slice(0, 2).join(",")).trim(),
      km: Number.isFinite(km) ? Math.round(km * 10) / 10 : 0,
      currency: currency || "CAD",
      prices,
    });
  }
  return out.sort((a, b) => a.km - b.km);
}

async function nearby(home: { latitude: number; longitude: number }, radiusKm: number): Promise<GasStation[]> {
  const r = await fetch(URL_NEARBY, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.googleMapsKey(),
      "X-Goog-FieldMask": FIELDS,
      "User-Agent": "Everydaypane/1.0",
    },
    body: JSON.stringify({
      includedTypes: ["gas_station"],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: home, radius: radiusKm * 1000 } },
    }),
  });
  if (!r.ok) {
    // Google's error body names the problem ("API key not valid", "Places API (New) has not been used in project …").
    const body = (await r.json().catch(() => null)) as { error?: { status?: unknown } } | null;
    throw new Error(`Google answered ${r.status}${body?.error?.status ? ` (${str(body.error.status)})` : ""}`);
  }
  return parseNearby(await r.json(), home);
}

export async function gasFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<GasData> {
  const radiusKm = gasRadiusInUse(config);
  const empty: GasData = { updatedAt: now, missing: "", radiusKm, stations: [] };
  if (!radiusKm) return empty;
  if (!env.googleMapsKey()) return { ...empty, missing: "key" };
  const home = { latitude: config.location.latitude, longitude: config.location.longitude };
  const key = `gas:${accountId}:${home.latitude.toFixed(3)},${home.longitude.toFixed(3)}:${radiusKm}`;
  try {
    const got = await cached(key, TTL, () => nearby(home, radiusKm), now);
    return { updatedAt: got.fetchedAt, missing: "", radiusKm, stations: got.value };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Google didn't answer" };
  }
}
