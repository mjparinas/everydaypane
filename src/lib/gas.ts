// Local gas prices (Melvin, 2026-11-26: "build the other 6 gaps", one of them local gas prices around Langley).
// Prices come from Google's Places API (New), whose gas stations carry `fuelOptions`: the last known price of each fuel
// the station sells (src/server/gas.ts). Kept free of zod so the admin, the server and the display can all import it.

export const GAS_FUELS = ["regular", "midgrade", "premium", "diesel"] as const;
export type GasFuel = (typeof GAS_FUELS)[number];

export const GAS_FUEL_LABELS: Record<GasFuel, string> = {
  regular: "Regular",
  midgrade: "Mid-grade",
  premium: "Premium",
  diesel: "Diesel",
};

/** Google's FuelType names for each of ours, best first (SP91 and friends are what some countries call them). */
export const GOOGLE_FUEL_TYPES: Record<GasFuel, string[]> = {
  regular: ["REGULAR_UNLEADED", "SP91", "SP91_E10", "SP92", "SP95", "SP95_E10", "E10"],
  midgrade: ["MIDGRADE", "SP95", "SP95_E10"],
  premium: ["PREMIUM", "SP98", "SP99", "SP100"],
  diesel: ["DIESEL", "DIESEL_PLUS"],
};

export const GAS_SORTS = ["price", "distance"] as const;
export type GasSort = (typeof GAS_SORTS)[number];

export const GAS_SORT_LABELS: Record<GasSort, string> = { price: "Cheapest First", distance: "Nearest First" };

/** How far from home a widget may look, in km. Google's nearby search reaches 50 km; a kitchen cares about 15. */
export const GAS_RADIUS_MIN = 1;
export const GAS_RADIUS_MAX = 15;

/** A price older than this is left out: nobody drives across town for last week's number. */
export const GAS_PRICE_MAX_AGE_MS = 3 * 86_400_000;

export interface GasPrice {
  /** In the currency's own unit per litre or gallon, as Google gives it (1.659 CAD a litre). */
  price: number;
  /** Epoch ms of the price's last update at Google; 0 when it gave none. */
  at: number;
}

export interface GasStation {
  id: string;
  name: string;
  /** Short street address ("20097 Fraser Hwy, Langley"). */
  address: string;
  /** Straight-line distance from home, km, one decimal. */
  km: number;
  currency: string;
  prices: Partial<Record<GasFuel, GasPrice>>;
}

export interface GasData {
  updatedAt: number;
  /** "key" while GOOGLE_MAPS_API_KEY isn't set; "" otherwise. */
  missing: "" | "key";
  /** The farthest radius read, km; widgets with a smaller one filter. */
  radiusKm: number;
  stations: GasStation[];
  error?: string;
}

export interface GasRow {
  station: GasStation;
  price: GasPrice;
}

/** The stations a widget shows: within its radius, with a fresh price for its fuel, sorted, at most `count`. */
export function gasRows(
  stations: GasStation[],
  opts: { fuel: GasFuel; radiusKm: number; count: number; sort: GasSort },
  now = Date.now(),
): GasRow[] {
  const rows: GasRow[] = [];
  for (const station of stations) {
    const price = station.prices[opts.fuel];
    if (!price || station.km > opts.radiusKm) continue;
    if (price.at && now - price.at > GAS_PRICE_MAX_AGE_MS) continue;
    rows.push({ station, price });
  }
  rows.sort((a, b) =>
    opts.sort === "distance"
      ? a.station.km - b.station.km || a.price.price - b.price.price
      : a.price.price - b.price.price || a.station.km - b.station.km,
  );
  return rows.slice(0, opts.count);
}

/** 1.659 CAD → "165.9¢" (Canadians read cents a litre); USD → "$3.45"; anything else → "1.659 EUR". */
export function gasPriceText(price: number, currency: string): string {
  if (currency === "CAD") return `${(Math.round(price * 1000) / 10).toFixed(1)}¢`;
  if (currency === "USD") return `$${price.toFixed(2)}`;
  return `${price.toFixed(3)} ${currency}`;
}

/** "Prices 5 km around home" style unit line: CAD prices are a litre; U.S. prices a gallon. */
export function gasUnit(currency: string): string {
  return currency === "USD" ? "a gallon" : "a litre";
}
