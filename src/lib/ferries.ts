// BC Ferries routes the ferries widget can show (Melvin, 2026-11-21). These are the routes BC Ferries publishes
// "how full" for on its current conditions pages, as the community BC Ferries API (bcferriesapi.ca) reads them: a code
// is the departure terminal's code and then the arrival's. Kept free of zod so the admin, the server and the display
// can all import it.

export const FERRY_TERMINALS = {
  TSA: "Tsawwassen",
  SWB: "Swartz Bay",
  SGI: "Southern Gulf Islands",
  DUK: "Duke Point",
  NAN: "Departure Bay",
  HSB: "Horseshoe Bay",
  LNG: "Langdale",
  BOW: "Bowen Island",
  FUL: "Fulford Harbour",
} as const;

export type FerryTerminal = keyof typeof FERRY_TERMINALS;

export const FERRY_ROUTES = [
  "TSASWB",
  "SWBTSA",
  "TSADUK",
  "DUKTSA",
  "TSANAN",
  "HSBNAN",
  "NANHSB",
  "HSBLNG",
  "LNGHSB",
  "HSBBOW",
  "TSASGI",
  "SWBSGI",
  "SWBFUL",
] as const;

export type FerryRoute = (typeof FERRY_ROUTES)[number];

export function ferryRouteName(code: string): string {
  const from = FERRY_TERMINALS[code.slice(0, 3) as FerryTerminal] ?? code.slice(0, 3);
  const to = FERRY_TERMINALS[code.slice(3) as FerryTerminal] ?? code.slice(3);
  return `${from} → ${to}`;
}
