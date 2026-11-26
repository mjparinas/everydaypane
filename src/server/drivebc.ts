import "server-only";

import { distanceKm } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { DriveBcCamera, DriveBcData } from "@/lib/display/types";
import { DRIVEBC_LATE_MS, isDriveBcId } from "@/lib/drivebc";

import { cached, getJson } from "./cache";

// DriveBC highway cameras (Melvin, 2026-11-25): still pictures from the Ministry of Transportation's public highway
// cameras, released under the Open Government Licence – British Columbia (catalogue.data.gov.bc.ca, "BC
// HighwayCams"). No key or sign-up.
//
// - The camera list is DriveBC's own site feed (www.drivebc.ca/api/webcams/), which has each camera's status and
//   last new picture. The older images.drivebc.ca/webcam/api/v1 is abandoned (most cameras there report months
//   old), so it isn't used. When the site feed fails, the camera search falls back to the monthly open data CSV,
//   which has names and places but no status. Both are parsed leniently, since neither has a published schema.
// - Pictures are www.drivebc.ca/images/<id>.jpg (the address the open data CSV lists). The old
//   images.drivebc.ca/bchighwaycam/pub/cameras/ addresses broke when DriveBC moved them.
// - Displays never talk to DriveBC: pictures come through /api/display/drivebc/image/, which fetches only cameras on
//   this household's widgets and builds the address itself. One copy per camera is kept a minute for every display.

const LIST_URL = "https://www.drivebc.ca/api/webcams/";
const CSV_URL =
  "https://catalogue.data.gov.bc.ca/dataset/6b39a910-6c77-476f-ac96-7b4f18849b1c/resource/a9d52d85-8402-4ce7-b2ac-a2779837c48a/download/webcams.csv";
const imageAddress = (id: string) => `https://www.drivebc.ca/images/${id}.jpg`;
const LIST_TTL = 10 * 60_000;
const CSV_TTL = 24 * 3_600_000;
const IMAGE_TTL = 60_000;
const MAX_IMAGE_BYTES = 3_000_000;

/** One camera from DriveBC's list, trimmed to what the search and the wall use. */
export interface DriveBcListing {
  id: string;
  name: string;
  caption: string;
  highway: string;
  region: string;
  lat: number | null;
  lon: number | null;
  updated: number | null;
  state: DriveBcCamera["state"];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const first = (o: Obj, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const time = (v: unknown) => {
  const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Latitude and longitude from a GeoJSON point ([lon, lat]), a { latitude, longitude } object or flat fields. */
function place(o: Obj): { lat: number | null; lon: number | null } {
  const loc = o.location;
  if (isObj(loc) && Array.isArray(loc.coordinates)) {
    const [lon, lat] = loc.coordinates.map(num);
    if (lat != null && lon != null) return { lat, lon };
  }
  const src = isObj(loc) ? loc : o;
  return { lat: num(first(src, "latitude", "lat")), lon: num(first(src, "longitude", "lon", "lng")) };
}

/** One camera record from the site feed (or the old v1 shape), or null when it has no usable id. */
export function parseCamera(raw: unknown): DriveBcListing | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!isDriveBcId(id)) return null;
  const highwayRaw = first(raw, "highway", "highway_number", "highwayNumber");
  const highway = isObj(highwayRaw) ? str(first(highwayRaw, "number", "name")) : str(highwayRaw);
  const regionRaw = first(raw, "region_name", "regionName", "region");
  const region = isObj(regionRaw) ? str(first(regionRaw, "name", "group")) : str(regionRaw);
  const on = first(raw, "is_on", "isOn");
  const late = raw.marked_stale === true || raw.marked_delayed === true || raw.markedStale === true || raw.markedDelayed === true;
  const updated = time(first(raw, "last_update_modified", "lastUpdateModified"));
  return {
    id,
    name: str(first(raw, "name", "camName")).slice(0, 120) || `Camera ${id}`,
    caption: str(raw.caption).slice(0, 200),
    highway: highway.slice(0, 20),
    region: region.slice(0, 60),
    ...place(raw),
    updated,
    state: on === false ? "off" : late ? "late" : "ok",
  };
}

/** The site feed's answer: a list, or a list under results / webcams. Records that don't parse are dropped. */
export function parseList(raw: unknown): DriveBcListing[] {
  const list = Array.isArray(raw) ? raw : isObj(raw) ? (raw.results ?? raw.webcams ?? raw.data) : null;
  if (!Array.isArray(list)) throw new Error("DriveBC's camera list wasn't a list");
  const out = new Map<string, DriveBcListing>();
  for (const r of list) {
    const c = parseCamera(r);
    if (c && !out.has(c.id)) out.set(c.id, c);
  }
  if (out.size === 0) throw new Error("DriveBC's camera list was empty");
  return [...out.values()];
}

/** RFC 4180 rows: quoted fields may hold commas, doubled quotes and line breaks. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** The open data CSV (id, camName, caption, highway_number, region_name, latitude, longitude, …), by its header. */
export function parseCsv(text: string): DriveBcListing[] {
  const [header, ...rows] = csvRows(text.replace(/^﻿/, ""));
  if (!header) throw new Error("DriveBC's camera CSV was empty");
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const at = { id: col("id"), name: col("camName"), caption: col("caption"), hwy: col("highway_number"), region: col("region_name") };
  const lat = col("latitude");
  const lon = col("longitude");
  if (at.id < 0 || at.name < 0) throw new Error("DriveBC's camera CSV has no id or camName column");
  return parseList(
    rows.map((r) => ({
      id: r[at.id],
      camName: r[at.name],
      caption: r[at.caption],
      highway_number: r[at.hwy],
      region_name: r[at.region],
      latitude: r[lat],
      longitude: r[lon],
    })),
  );
}

async function siteList(now: number) {
  return cached("drivebc:list", LIST_TTL, async () => parseList(await getJson(LIST_URL, {}, 15_000)), now);
}

async function csvList(now: number) {
  return cached(
    "drivebc:csv",
    CSV_TTL,
    async () => {
      const r = await fetch(CSV_URL, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Everydaypane/1.0" } });
      if (!r.ok) throw new Error(`DriveBC's camera CSV answered ${r.status}`);
      return parseCsv(await r.text());
    },
    now,
  );
}

/** Every camera DriveBC lists: the site feed, or the open data CSV when that fails. */
export async function cameraList(now = Date.now()): Promise<DriveBcListing[]> {
  try {
    return (await siteList(now)).value;
  } catch {
    return (await csvList(now)).value;
  }
}

export interface DriveBcMatch {
  id: string;
  name: string;
  caption: string;
  highway: string;
  km: number | null;
}

/**
 * The widget settings' camera search: every word typed must appear in the name, caption, highway ("hwy 1",
 * "highway 5") or id. Nearest the dashboard first; with nothing typed, simply the nearest cameras.
 */
export function findCameras(list: DriveBcListing[], q: string, home: { latitude: number; longitude: number }, max = 12): DriveBcMatch[] {
  const words = q
    .toLowerCase()
    .replace(/\b(hwy|highway)\s*(\d+)/g, "hwy$2")
    .split(/\s+/)
    .filter(Boolean);
  const km = (c: DriveBcListing) => (c.lat != null && c.lon != null ? distanceKm(home.latitude, home.longitude, c.lat, c.lon) : null);
  return list
    .filter((c) => {
      const hay = `${c.name} ${c.caption} ${c.region} hwy${c.highway} #${c.id}`.toLowerCase();
      return words.every((w) => (/^\d+$/.test(w) ? c.id === w || hay.includes(w) : hay.includes(w)));
    })
    .map((c) => ({ c, d: km(c) }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
    .slice(0, max)
    .map(({ c, d }) => ({ id: c.id, name: c.name, caption: c.caption, highway: c.highway, km: d == null ? null : Math.round(d) }));
}

/** Every camera any DriveBC widget shows, once each. */
export function camerasInUse(config: DashboardConfig): Set<string> {
  const ids = new Set<string>();
  for (const v of config.views) for (const w of v.widgets) if (w.type === "drivebc") for (const c of w.cameras) ids.add(c.id);
  return ids;
}

/** Status of the cameras on this household's widgets. DriveBC failing leaves the pictures showing, just unlabelled. */
export async function driveBcFeed(config: DashboardConfig, now = Date.now()): Promise<DriveBcData> {
  const ids = camerasInUse(config);
  if (ids.size === 0) return { updatedAt: now, cameras: [], down: false };
  try {
    const { value } = await siteList(now);
    const cameras = value
      .filter((c) => ids.has(c.id))
      .map((c): DriveBcCamera => {
        // A picture DriveBC still calls fresh but hasn't replaced in 20 minutes gets DriveBC's own "late" treatment.
        const late = c.state === "ok" && c.updated !== null && now - c.updated > DRIVEBC_LATE_MS;
        return { id: c.id, name: c.name, caption: c.caption, updated: c.updated, state: late ? "late" : c.state };
      });
    return { updatedAt: now, cameras, down: false };
  } catch {
    return { updatedAt: now, cameras: [], down: true };
  }
}

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const pictures = new Map<string, { bytes: Uint8Array; at: number }>();

/** A camera's current picture, only for a camera on one of this household's widgets. */
export async function driveBcImage(config: DashboardConfig, id: string, now = Date.now()): Promise<Response | null> {
  if (!isDriveBcId(id) || !camerasInUse(config).has(id)) return null;
  let hit = pictures.get(id);
  if (!hit || now - hit.at >= IMAGE_TTL) {
    const r = await fetch(imageAddress(id), { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Everydaypane/1.0" } });
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!r.ok || !isJpeg(bytes) || bytes.length > MAX_IMAGE_BYTES) {
      console.error(`[drivebc] camera ${id} answered ${r.status} (${r.headers.get("content-type") ?? "no type"}, ${bytes.length} bytes)`);
      if (!hit) return null;
    } else {
      hit = { bytes, at: now };
      pictures.set(id, hit);
      // Only cameras on widgets are ever kept, but a camera taken off a widget shouldn't stay in memory forever.
      if (pictures.size > 64) pictures.delete(pictures.keys().next().value!);
    }
  }
  return new Response(hit.bytes as BodyInit, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
}

/** Tests only. */
export function clearDriveBcPictures(): void {
  pictures.clear();
}
