import "server-only";

import { BORDER_CROSSINGS, BORDER_INFO, type BorderCrossing } from "@/lib/border";
import type { DashboardConfig } from "@/lib/config/schema";
import type { BorderCrossingData, BorderData, BorderWait } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// Border wait times (Melvin, 2026-11-25): Lower Mainland crossings in both directions, from the two agencies' own
// public feeds, no key. Canada-bound waits are CBSA's "Current Border Wait Times" open data (bwt-eng.csv, a
// semicolon-separated file of every land crossing, Open Government Licence - Canada); U.S.-bound waits are U.S. CBP's
// bwt.cbp.gov JSON (every port, about 100 KB). Each is read at most every five minutes for every household and trimmed
// to the crossings in src/lib/border.ts before it is cached; one failing never hides the other, and the last good copy
// is served meanwhile. Both agencies update roughly hourly, so readings carry their own time. Neither is reachable
// from this sandbox: tests use the shapes read on 2026-11-26.

const CBSA_URL = "https://www.cbsa-asfc.gc.ca/bwt-taf/bwt-eng.csv";
const CBP_URL = "https://bwt.cbp.gov/api/bwtnew";
const TTL = 5 * 60_000;

type Waits = Partial<Record<BorderCrossing, BorderWait>>;

// The time zone abbreviations both agencies write after a clock time, in hours from UTC.
const ZONES: Record<string, number> = {
  NST: -3.5,
  NDT: -2.5,
  AST: -4,
  ADT: -3,
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
};

function epoch(y: number, mo: number, d: number, h: number, mi: number, zone: string): number {
  const off = ZONES[zone.toUpperCase()];
  if (off === undefined || !y || !mo || !d) return 0;
  return Date.UTC(y, mo - 1, d, h, mi) - off * 3_600_000;
}

/** "2026-11-25 14:48 PDT" → epoch ms (0 when it can't be read). */
export function cbsaTime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*([A-Z]{3})?/i.exec(s.trim());
  if (!m) return 0;
  return epoch(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, m[6] ?? "PDT");
}

/** CBSA writes "No Delay", "5 minutes", "1 hour 10 minutes", "Not Applicable", "--" or "Temporarily closed". */
export function cbsaWait(s: string): { minutes: number | null; closed: boolean } {
  const t = s.trim().toLowerCase();
  if (t.includes("closed")) return { minutes: null, closed: true };
  if (t.startsWith("no delay")) return { minutes: 0, closed: false };
  const hours = /(\d+)\s*h/.exec(t);
  const mins = /(\d+)\s*m/.exec(t);
  if (!hours && !mins) return { minutes: null, closed: false };
  return { minutes: Number(hours?.[1] ?? 0) * 60 + Number(mins?.[1] ?? 0), closed: false };
}

function cells(line: string): string[] {
  // The file separates cells with semicolons (doubled in the copy read on 2026-11-26); no value is ever empty ("--"
  // stands for none), so runs of them are one break. A comma file is read too, in case CBSA ever switches.
  const sep = line.includes(";") ? /;+/ : /,/;
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, "").trim());
}

/** CBSA's file → Canada-bound waits for our crossings. Columns are found by their header, not their position. */
export function parseCbsa(csv: string): Waits {
  const lines = csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = cells(lines[0] ?? "").map((c) => c.toLowerCase());
  const col = (...words: string[]) => header.findIndex((c) => words.every((w) => c.includes(w)));
  const office = col("office");
  const updated = col("updated");
  const travellers = col("travel", "canada");
  if (office < 0 || travellers < 0) throw new Error("CBSA's file has no traveller column");
  const out: Waits = {};
  for (const line of lines.slice(1)) {
    const row = cells(line);
    const name = (row[office] ?? "").toLowerCase();
    const id = BORDER_CROSSINGS.find((c) => name.includes(BORDER_INFO[c].cbsa));
    if (!id || out[id]) continue;
    out[id] = { ...cbsaWait(row[travellers] ?? ""), at: updated < 0 ? 0 : cbsaTime(row[updated] ?? "") };
  }
  return out;
}

interface CbpLane {
  update_time?: unknown;
  operational_status?: unknown;
  delay_minutes?: unknown;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** "no delay" → 0, "delay" → its minutes; "Lanes Closed" closed; "Update Pending", "N/A" and "" are no reading. */
function cbpLane(l: CbpLane | undefined): { minutes: number | null; closed: boolean } {
  const status = str(l?.operational_status).trim().toLowerCase();
  if (status === "lanes closed") return { minutes: null, closed: true };
  if (status === "no delay") return { minutes: 0, closed: false };
  const n = Number(str(l?.delay_minutes));
  if (status === "delay" && str(l?.delay_minutes) !== "" && Number.isFinite(n))
    return { minutes: Math.max(0, Math.round(n)), closed: false };
  return { minutes: null, closed: false };
}

/** "At 3:00 pm PST" (or "At Noon PDT") on the port's "11/25/2026" → epoch ms; a time later than now is yesterday's. */
export function cbpTime(update: string, date: string, now = Date.now()): number {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!d) return 0;
  let h: number;
  let mi = 0;
  let zone: string;
  const clock = /(\d{1,2}):(\d{2})\s*(am|pm)\s+([A-Z]{3})/i.exec(update);
  const word = /\b(noon|midnight)\s+([A-Z]{3})/i.exec(update);
  if (clock) {
    h = (Number(clock[1]) % 12) + (clock[3]!.toLowerCase() === "pm" ? 12 : 0);
    mi = Number(clock[2]);
    zone = clock[4]!;
  } else if (word) {
    h = word[1]!.toLowerCase() === "noon" ? 12 : 0;
    zone = word[2]!;
  } else return 0;
  const at = epoch(+d[3]!, +d[1]!, +d[2]!, h, mi, zone);
  return at > now + 30 * 60_000 ? at - 86_400_000 : at;
}

/** CBP's array of ports → U.S.-bound waits for our crossings (regular car lanes, and NEXUS where it reads them). */
export function parseCbp(raw: unknown, now = Date.now()): Waits {
  if (!Array.isArray(raw)) throw new Error("CBP answered without a list of ports");
  const out: Waits = {};
  for (const p of raw as Record<string, unknown>[]) {
    const id = BORDER_CROSSINGS.find((c) => BORDER_INFO[c].cbp === str(p?.port_number));
    if (!id) continue;
    const pv = (p.passenger_vehicle_lanes ?? {}) as Record<string, CbpLane | undefined>;
    const std = cbpLane(pv.standard_lanes);
    const nexus = cbpLane(pv.NEXUS_SENTRI_lanes);
    const closed = str(p.port_status).toLowerCase() === "closed" || std.closed;
    out[id] = {
      minutes: closed ? null : std.minutes,
      ...(!closed && nexus.minutes !== null ? { nexus: nexus.minutes } : {}),
      closed,
      at: cbpTime(str(pv.standard_lanes?.update_time), str(p.date), now),
    };
  }
  return out;
}

async function getText(url: string, timeoutMs = 10_000): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "Everydaypane/1.0" } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.text();
}

/** Every crossing any border widget shows, once each, in the order widgets list them. */
export function crossingsInUse(config: DashboardConfig): BorderCrossing[] {
  const ids = new Set<BorderCrossing>();
  for (const v of config.views) for (const w of v.widgets) if (w.type === "borderWait") for (const c of w.crossings) ids.add(c);
  return [...ids];
}

async function read(key: string, load: () => Promise<Waits>, now: number): Promise<Waits | null> {
  try {
    return (await cached(key, TTL, load, now)).value;
  } catch {
    return null;
  }
}

export async function borderFeed(config: DashboardConfig, now = Date.now()): Promise<BorderData> {
  const ids = crossingsInUse(config);
  if (!ids.length) return { updatedAt: now, crossings: [], down: { cbsa: false, cbp: false } };
  const [cbsa, cbp] = await Promise.all([
    read("border:cbsa", async () => parseCbsa(await getText(CBSA_URL)), now),
    read("border:cbp", async () => parseCbp(await getJson(CBP_URL, {}, 10_000), now), now),
  ]);
  const crossings: BorderCrossingData[] = ids.map((id) => ({
    id,
    name: BORDER_INFO[id].name,
    toUS: cbp?.[id] ?? null,
    toCanada: cbsa?.[id] ?? null,
  }));
  return { updatedAt: now, crossings, down: { cbsa: cbsa === null, cbp: cbp === null } };
}
