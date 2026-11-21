import "server-only";

import { inflateRawSync } from "node:zlib";

// The small pieces TransLink's open data needs, written here instead of pulling in protobuf and zip libraries
// (Melvin, 2026-11-19: TransLink departures). GTFS-realtime is a protobuf feed, but only a handful of its fields matter
// for a departures board; the static GTFS is a zip of CSV files, of which three small ones matter (stops, routes,
// trips). The big stop_times.txt is never read: departure times come from the realtime feed.

// ---- Protobuf (just enough of the wire format) ----

class Reader {
  pos: number;
  constructor(
    readonly buf: Uint8Array,
    start = 0,
    readonly end = buf.length,
  ) {
    this.pos = start;
  }

  /** A varint as an unsigned number (exact up to 2^53, plenty for times), plus its low 32 bits for int32 fields. */
  varint(): { value: number; low: number } {
    let low = 0;
    let high = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.end) throw new Error("Truncated protobuf");
      const b = this.buf[this.pos++] ?? 0;
      if (shift < 28) low |= (b & 0x7f) << shift;
      else if (shift === 28) {
        low |= (b & 0x0f) << 28;
        high |= (b & 0x7f) >> 4;
      } else high |= (b & 0x7f) << (shift - 32);
      shift += 7;
      if (!(b & 0x80)) break;
      if (shift > 70) throw new Error("Bad varint");
    }
    return { value: (high >>> 0) * 2 ** 32 + (low >>> 0), low };
  }

  /** Each field of this message in turn: its number, wire type and a reader for its bytes when length-delimited. */
  *fields(): Generator<{ field: number; type: number; num: number; int32: number; sub: Reader | null; bytes: Uint8Array | null }> {
    while (this.pos < this.end) {
      const key = this.varint().value;
      const field = Math.floor(key / 8);
      const type = key % 8;
      if (type === 0) {
        const v = this.varint();
        yield { field, type, num: v.value, int32: v.low | 0, sub: null, bytes: null };
      } else if (type === 2) {
        const len = this.varint().value;
        const start = this.pos;
        this.pos += len;
        if (this.pos > this.end) throw new Error("Truncated protobuf");
        yield {
          field,
          type,
          num: 0,
          int32: 0,
          sub: new Reader(this.buf, start, start + len),
          bytes: this.buf.subarray(start, start + len),
        };
      } else if (type === 1) this.pos += 8;
      else if (type === 5) this.pos += 4;
      else throw new Error(`Unsupported protobuf wire type ${type}`);
    }
  }
}

const decoder = new TextDecoder();

/** One predicted stop of a trip, from a GTFS-realtime TripUpdate. */
export interface RtStop {
  stopId: string;
  /** Epoch seconds of the predicted departure (or arrival when the feed gives no departure). */
  time: number;
  /** Seconds late (negative: early), when the feed says. */
  delay: number | null;
}

export interface RtTrip {
  tripId: string;
  routeId: string;
  directionId: number | null;
  canceled: boolean;
  /** True when a vehicle is attached, so the times are a live prediction rather than the timetable. */
  hasVehicle: boolean;
  stops: RtStop[];
}

function stopTimeEvent(r: Reader): { time: number | null; delay: number | null } {
  let time: number | null = null;
  let delay: number | null = null;
  for (const f of r.fields()) {
    if (f.field === 1 && f.type === 0) delay = f.int32;
    else if (f.field === 2 && f.type === 0) time = f.num;
  }
  return { time, delay };
}

function stopTimeUpdate(r: Reader): RtStop | null {
  let stopId = "";
  let arrival: ReturnType<typeof stopTimeEvent> | null = null;
  let departure: ReturnType<typeof stopTimeEvent> | null = null;
  let skipped = false;
  for (const f of r.fields()) {
    if (f.field === 4 && f.bytes) stopId = decoder.decode(f.bytes);
    else if (f.field === 2 && f.sub) arrival = stopTimeEvent(f.sub);
    else if (f.field === 3 && f.sub) departure = stopTimeEvent(f.sub);
    // ScheduleRelationship: SKIPPED (1) and NO_DATA (2) have no time worth showing.
    else if (f.field === 5 && f.type === 0) skipped = f.num === 1 || f.num === 2;
  }
  const time = departure?.time ?? arrival?.time ?? null;
  if (skipped || !stopId || time === null) return null;
  return { stopId, time, delay: departure?.delay ?? arrival?.delay ?? null };
}

function tripUpdate(r: Reader): RtTrip {
  const trip: RtTrip = { tripId: "", routeId: "", directionId: null, canceled: false, hasVehicle: false, stops: [] };
  for (const f of r.fields()) {
    if (f.field === 1 && f.sub) {
      for (const t of f.sub.fields()) {
        if (t.field === 1 && t.bytes) trip.tripId = decoder.decode(t.bytes);
        else if (t.field === 5 && t.bytes) trip.routeId = decoder.decode(t.bytes);
        else if (t.field === 6 && t.type === 0) trip.directionId = t.num;
        else if (t.field === 4 && t.type === 0) trip.canceled = t.num === 3;
      }
    } else if (f.field === 3 && f.sub) trip.hasVehicle = true;
    else if (f.field === 2 && f.sub) {
      const stop = stopTimeUpdate(f.sub);
      if (stop) trip.stops.push(stop);
    }
  }
  return trip;
}

/**
 * The trip updates of a GTFS-realtime FeedMessage, keeping only stops in `wanted` (when given), so a feed for the whole
 * region shrinks to what a few widgets need.
 */
export function decodeTripUpdates(buf: Uint8Array, wanted?: Set<string>): RtTrip[] {
  const trips: RtTrip[] = [];
  for (const f of new Reader(buf).fields()) {
    if (f.field !== 2 || !f.sub) continue; // FeedMessage.entity
    for (const e of f.sub.fields()) {
      if (e.field !== 3 || !e.sub) continue; // FeedEntity.trip_update
      const trip = tripUpdate(e.sub);
      if (wanted) trip.stops = trip.stops.filter((s) => wanted.has(s.stopId));
      if (trip.stops.length || (trip.canceled && !wanted)) trips.push(trip);
    }
  }
  return trips;
}

// ---- Zip (just the central directory and deflate) ----

/** Reads bytes [start, end) of the zip, by HTTP range or from a buffer already downloaded. */
export type ZipSource = { size: number; read: (start: number, end: number) => Promise<Uint8Array> };

const u16 = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u32 = (b: Uint8Array, at: number) => (u16(b, at) | (u16(b, at + 2) << 16)) >>> 0;

/** The named files of a zip, decompressed to text. Files that aren't there are left out. */
export async function readZipFiles(src: ZipSource, names: string[]): Promise<Map<string, string>> {
  const tailLen = Math.min(src.size, 65_557);
  const tail = await src.read(src.size - tailLen, src.size);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  const cdInTail = cdOffset - (src.size - tailLen);
  const cd = cdInTail >= 0 ? tail.subarray(cdInTail, cdInTail + cdSize) : await src.read(cdOffset, cdOffset + cdSize);

  const wanted = new Set(names);
  const out = new Map<string, string>();
  let p = 0;
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const local = u32(cd, p + 42);
    // GTFS files sometimes sit in a folder inside the zip; match on the file's own name.
    const name =
      decoder
        .decode(cd.subarray(p + 46, p + 46 + nameLen))
        .split("/")
        .pop() ?? "";
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.has(name) || out.has(name)) continue;
    const header = await src.read(local, local + 30);
    if (u32(header, 0) !== 0x04034b50) throw new Error("Bad zip entry");
    const dataStart = local + 30 + u16(header, 26) + u16(header, 28);
    const data = await src.read(dataStart, dataStart + compSize);
    if (method === 0) out.set(name, decoder.decode(data));
    else if (method === 8) out.set(name, decoder.decode(inflateRawSync(data)));
    else throw new Error(`Unsupported zip compression ${method}`);
  }
  return out;
}

/** A zip at a URL: only the parts needed are downloaded when the server takes range requests, else the whole file. */
export async function zipFromUrl(url: string, timeoutMs = 60_000): Promise<ZipSource> {
  const headers = { "User-Agent": "Everydaypane/1.0" };
  const first = await fetch(url, { headers: { ...headers, Range: "bytes=-65557" }, signal: AbortSignal.timeout(timeoutMs) });
  if (first.status === 206) {
    const size = Number(/\/(\d+)$/.exec(first.headers.get("content-range") ?? "")?.[1] ?? NaN);
    const tail = new Uint8Array(await first.arrayBuffer());
    if (Number.isFinite(size)) {
      return {
        size,
        read: async (start, end) => {
          if (start >= size - tail.length) return tail.subarray(start - (size - tail.length), end - (size - tail.length));
          const r = await fetch(url, {
            headers: { ...headers, Range: `bytes=${start}-${end - 1}` },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (r.status !== 206) throw new Error(`${new URL(url).host} answered ${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        },
      };
    }
  }
  const whole = first.status === 200 ? first : await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  if (!whole?.ok) throw new Error(`${new URL(url).host} answered ${whole?.status ?? "nothing"}`);
  const buf = new Uint8Array(await whole.arrayBuffer());
  return { size: buf.length, read: (start, end) => Promise.resolve(buf.subarray(start, end)) };
}

// ---- CSV ----

/** Rows of a GTFS CSV file as objects keyed by its header (quoted fields and "" escapes handled). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((k) => k.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
