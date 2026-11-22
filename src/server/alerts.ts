import "server-only";

import { distanceKm, insidePolygon, rank } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { AlertData, AlertSeverity, EmergencyAlert } from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";

import { cached } from "./cache";

// Emergency alerts (Melvin, 2026-11-17): urgent alerts for Langley, the Lower Mainland, BC and Canada.
//
// - Alert Ready and Environment Canada weather warnings both come from NAAD, the national alert aggregator that feeds
//   Alert Ready. Its Atom feed lists every current alert with its polygons, severity and expiry, so one request covers
//   both, and an alert counts when the dashboard's location is inside (or within 5 km of) one of its polygons.
//   (Environment Canada's own GeoMet API refuses automated readers; NAAD carries the same CAP messages.)
// - DriveBC road events from Open511: closures and major incidents (washouts, snow, torrential rain) within the radius.
// - Earthquakes Canada (NRCan's FDSN service): the last 24 hours, at or above the magnitude set, within the radius.
// - BC Hydro power outages (Melvin, 2026-11-19): the outage map's own JSON, outages whose area covers the home or is
//   within `powerKm` of it.
//
// Each source is fetched and cached on its own, so one being down never hides the others.

const NAAD_FEED = "https://rss.naad-adna.pelmorex.com/";
const OPEN511 = "https://api.open511.gov.bc.ca/events";
const QUAKES = "https://earthquakescanada.nrcan.gc.ca/fdsnws/event/1/query";
const BC_HYDRO = "https://www.bchydro.com/power-outages/app/outages-map-data.json";

async function getText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "Everydaypane/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.text();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---- NAAD (Alert Ready and Environment Canada) ----

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeXml(m[1] ?? "").trim() : "";
};
const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => decodeXml(m[1] ?? "").trim());

/** The summary is HTML ("Description: …<br>Expires: …<br>Area: …"): back to lines of plain text. */
function summaryFields(html: string): Record<string, string> {
  const text = decodeXml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
  const out: Record<string, string> = {};
  let key = "";
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z ]{3,30}):\s*(.*)$/.exec(line);
    if (m?.[1]) {
      key = m[1].trim().toLowerCase();
      out[key] = (m[2] ?? "").trim();
    } else if (key && line.trim()) {
      out[key] = `${out[key] ?? ""} ${line.trim()}`.trim();
    }
  }
  return out;
}

const CAP_SEVERITY: Record<string, AlertSeverity> = { extreme: "extreme", severe: "severe", moderate: "moderate", minor: "minor" };

/**
 * Alerts from NAAD's Atom feed that cover a point. Test messages, cancellations, ended warnings, French duplicates
 * and expired alerts are left out.
 */
export function parseNaad(xml: string, at: { lat: number; lon: number }, now: number): EmergencyAlert[] {
  const out: EmergencyAlert[] = [];
  for (const entry of xml.split(/<entry[\s>]/).slice(1)) {
    const cats = Object.fromEntries(
      [...entry.matchAll(/<category[^>]*term="([^"]*)"/g)]
        .map((m) => decodeXml(m[1] ?? "").split("="))
        .filter((kv): kv is [string, string] => kv.length === 2)
        .map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (cats.status && cats.status !== "Actual") continue;
    if (cats.msgtype === "Cancel") continue;
    if (cats.language && !cats.language.toLowerCase().startsWith("en")) continue;
    const title = tag(entry, "title");
    if (/\bended\b|\bterminé/i.test(title)) continue;

    const polygons = tags(entry, "georss:polygon").map((p) => {
      const n = p.split(/\s+/).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i] ?? 0, n[i + 1] ?? 0]);
      return pts;
    });
    const covers = polygons.some(
      (poly) => insidePolygon(at.lat, at.lon, poly) || poly.some(([lat, lon]) => distanceKm(at.lat, at.lon, lat, lon) <= 5),
    );
    if (!covers) continue;

    const fields = summaryFields(tag(entry, "summary"));
    const expires = fields.expires ? Date.parse(fields.expires) : NaN;
    if (Number.isFinite(expires) && expires <= now) continue;
    const author = tag(entry, "name");
    const weather = /environment canada|environnement canada/i.test(author);
    const id = (/(urn:oid:[\d.]+)/.exec(tag(entry, "id")) ?? [])[1] ?? tag(entry, "id");
    const sent = Date.parse(tag(entry, "updated"));
    out.push({
      id: `naad:${id}`,
      source: weather ? "weather" : "alertReady",
      severity: CAP_SEVERITY[(cats.severity ?? "").toLowerCase()] ?? "minor",
      title: clip(
        title.replace(/^./, (c) => c.toUpperCase()),
        120,
      ),
      area: clip(fields.area ?? "", 160),
      description: clip(fields.description ?? "", 700),
      sent: Number.isFinite(sent) ? sent : now,
      expires: Number.isFinite(expires) ? expires : null,
    });
  }
  return out;
}

// ---- DriveBC (Open511) ----

interface Open511Event {
  id?: string;
  headline?: string;
  event_type?: string;
  severity?: string;
  description?: string;
  created?: string;
  updated?: string;
  roads?: { name?: string; state?: string }[];
  geography?: { type?: string; coordinates?: unknown };
}

function firstPoint(coordinates: unknown): [number, number] | null {
  // GeoJSON: [lon, lat] for a point, nested arrays for lines.
  let c = coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? [c[1], c[0]] : null;
}

const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/** Road events worth a wall: major ones (closures, washouts) and weather conditions, within the radius. */
export function parseOpen511(raw: unknown, at: { lat: number; lon: number }, radiusKm: number): EmergencyAlert[] {
  const events = (raw as { events?: Open511Event[] } | null)?.events ?? [];
  const out: EmergencyAlert[] = [];
  for (const e of events) {
    const major = e.severity === "MAJOR";
    const weather = e.event_type === "WEATHER_CONDITION";
    if (!e.id || (!major && !weather)) continue;
    const p = firstPoint(e.geography?.coordinates);
    if (!p || distanceKm(at.lat, at.lon, p[0], p[1]) > radiusKm) continue;
    const roads = [...new Set((e.roads ?? []).map((r) => r.name).filter(Boolean))].join(", ");
    const closed = (e.roads ?? []).some((r) => r.state === "CLOSED");
    out.push({
      id: `drivebc:${e.id}`,
      source: "roads",
      severity: major && closed ? "severe" : major ? "moderate" : "minor",
      title: clip(`${roads || "Road"}: ${closed ? "closed" : title(e.headline ?? e.event_type ?? "Incident")}`, 120),
      area: "DriveBC",
      description: clip((e.description ?? "").replace(/\s+/g, " ").trim(), 700),
      sent: Date.parse(e.updated ?? e.created ?? "") || 0,
      expires: null,
    });
  }
  return out;
}

// ---- Earthquakes Canada ----

/** NRCan's FDSN text format: #EventID|Time|Latitude|Longitude|Depth/km|MagType|Magnitude|EventLocationName */
export function parseQuakes(text: string, at: { lat: number; lon: number }, radiusKm: number, minMagnitude: number): EmergencyAlert[] {
  const out: EmergencyAlert[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, time, lat, lon, depth, , mag, place] = line.split("|");
    const m = Number(mag);
    const la = Number(lat);
    const lo = Number(lon);
    if (!id || !Number.isFinite(m) || m < minMagnitude || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const km = distanceKm(at.lat, at.lon, la, lo);
    if (km > radiusKm) continue;
    const where = (place ?? "").split("/")[0]?.trim() || "Near you";
    out.push({
      id: `quake:${id}`,
      source: "earthquakes",
      severity: m >= 6.5 ? "extreme" : m >= 5.5 ? "severe" : m >= 4.5 ? "moderate" : "minor",
      title: `Magnitude ${m.toFixed(1)} earthquake`,
      area: clip(where, 120),
      description: `${Math.round(km)} km away, ${Math.round(Number(depth) || 0)} km deep.`,
      sent: Date.parse(time ?? "") || 0,
      expires: null,
    });
  }
  return out;
}

// ---- BC Hydro ----

interface HydroOutage {
  id?: number | string;
  municipality?: string;
  area?: string;
  cause?: string;
  numCustomersOut?: number;
  crewStatusDescription?: string;
  crewEtr?: number | null;
  showEtr?: boolean;
  dateOff?: number;
  dateOn?: number | null;
  lastUpdated?: number;
  latitude?: number;
  longitude?: number;
  polygon?: number[];
}

/**
 * The outage map's list (a JSON array; times in epoch ms; `polygon` a flat list of longitude, latitude pairs). An outage
 * whose area covers the home is severe, so it reaches the red strip by default; one nearby is moderate when it leaves
 * 1,000 or more customers in the dark, minor otherwise. Restored outages are left out.
 */
export function parseHydro(
  raw: unknown,
  at: { lat: number; lon: number },
  radiusKm: number,
  timeZone: string,
  now: number,
): EmergencyAlert[] {
  if (!Array.isArray(raw)) return [];
  const time = zonedFormatter(timeZone, { hour: "numeric", minute: "2-digit", weekday: "short" });
  const out: EmergencyAlert[] = [];
  for (const o of raw as HydroOutage[]) {
    if (o.id === undefined || (typeof o.dateOn === "number" && o.dateOn <= now)) continue;
    const flat = Array.isArray(o.polygon) ? o.polygon.filter((n) => typeof n === "number") : [];
    const poly: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) poly.push([flat[i + 1] ?? 0, flat[i] ?? 0]);
    const here = poly.length >= 3 && insidePolygon(at.lat, at.lon, poly);
    const points: [number, number][] = [...poly];
    if (typeof o.latitude === "number" && typeof o.longitude === "number") points.push([o.latitude, o.longitude]);
    const km = Math.min(Infinity, ...points.map(([la, lo]) => distanceKm(at.lat, at.lon, la, lo)));
    if (!here && !(km <= radiusKm)) continue;
    const customers = Math.max(0, Math.round(Number(o.numCustomersOut) || 0));
    const place = (o.area || o.municipality || "").trim();
    const details = [
      o.cause?.trim(),
      o.crewStatusDescription?.trim(),
      o.showEtr !== false && typeof o.crewEtr === "number" && o.crewEtr > now ? `Power back by about ${time.format(o.crewEtr)}` : "",
    ].filter(Boolean);
    out.push({
      id: `bchydro:${o.id}`,
      source: "power",
      severity: here ? "severe" : customers >= 1000 ? "moderate" : "minor",
      title: clip(
        `${here ? "Power outage here" : "Power outage nearby"}: ${customers.toLocaleString("en-CA")} ${customers === 1 ? "customer" : "customers"}`,
        120,
      ),
      area: clip(
        [place, place && o.municipality && !place.includes(o.municipality) ? o.municipality : ""].filter(Boolean).join(", ") || "BC Hydro",
        160,
      ),
      description: clip(details.map((d) => (d && /[.!?]$/.test(d) ? d : `${d}.`)).join(" "), 700),
      sent: Number(o.lastUpdated) || Number(o.dateOff) || now,
      expires: null,
    });
  }
  return out;
}

// ---- Together ----

const sortAlerts = (list: EmergencyAlert[]) => [...list].sort((a, b) => rank(a.severity) - rank(b.severity) || b.sent - a.sent);

export async function alertsFeed(config: DashboardConfig, now = Date.now()): Promise<AlertData> {
  const a = config.alerts;
  if (!a.enabled) return { updatedAt: now, alerts: [] };
  const at = { lat: config.location.latitude, lon: config.location.longitude };
  const loc = `${at.lat.toFixed(2)},${at.lon.toFixed(2)}`;
  const jobs: Promise<EmergencyAlert[]>[] = [];

  if (a.sources.alertReady || a.sources.weather) {
    jobs.push(
      cached(`alerts:naad:${loc}`, 2 * 60_000, async () => parseNaad(await getText(NAAD_FEED), at, now), now).then((r) =>
        r.value.filter((x) => (x.source === "weather" ? a.sources.weather : a.sources.alertReady)),
      ),
    );
  }
  if (a.sources.roads) {
    // Open511's bbox is in degrees: about 1° of latitude per 111 km, and longitude shrinks with latitude.
    const dLat = a.radiusKm / 111;
    const dLon = a.radiusKm / (111 * Math.cos((at.lat * Math.PI) / 180));
    const bbox = [at.lon - dLon, at.lat - dLat, at.lon + dLon, at.lat + dLat].map((n) => n.toFixed(3)).join(",");
    const url = `${OPEN511}?${new URLSearchParams({ format: "json", status: "ACTIVE", bbox, limit: "500" })}`;
    jobs.push(
      cached(
        `alerts:roads:${loc}:${a.radiusKm}`,
        5 * 60_000,
        async () => parseOpen511(JSON.parse(await getText(url)), at, a.radiusKm),
        now,
      ).then((r) => r.value),
    );
  }
  if (a.sources.earthquakes) {
    const since = new Date(now - 24 * 3_600_000).toISOString().slice(0, 19);
    const url = `${QUAKES}?${new URLSearchParams({ format: "text", starttime: since, minmagnitude: String(a.minMagnitude) })}`;
    jobs.push(
      cached(
        `alerts:quakes:${loc}:${a.radiusKm}:${a.minMagnitude}`,
        5 * 60_000,
        async () => parseQuakes(await getText(url), at, a.radiusKm, a.minMagnitude),
        now,
      ).then((r) => r.value),
    );
  }

  if (a.sources.power) {
    jobs.push(
      cached(
        `alerts:power:${loc}:${a.powerKm}`,
        5 * 60_000,
        async () => parseHydro(JSON.parse(await getText(BC_HYDRO)), at, a.powerKm, config.location.timeZone, now),
        now,
      ).then((r) => r.value),
    );
  }

  const results = await Promise.allSettled(jobs);
  const alerts = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return { updatedAt: now, alerts: sortAlerts(alerts.filter((x) => x.expires === null || x.expires > now)).slice(0, 30) };
}
