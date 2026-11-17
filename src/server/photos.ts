import "server-only";

import type { DashboardConfig, PhotoSource } from "@/lib/config/schema";
import type { PhotoData, PhotoItem } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret } from "./secrets";

// Photos (Melvin, 2026-11-17: Amazon Photos, choosable by person). Three kinds of source, all listed and cached by the
// server; a display gets only small ids and sizes, and images come through our own proxy at the size it draws.
//
// - amazonShare: an album shared "with anyone who has the link". Amazon has no official API; these are the endpoints
//   its share page uses (as several open-source photo frames use them): /drive/v1/shares/<id> for the root node, then
//   /drive/v1/nodes/<id>/children with tempLink=true, recursing into folders. No sign-in needed.
// - amazonPeople: photos of chosen people (Amazon's face groups). Needs the admin's Amazon session cookies, stored
//   encrypted (amazon.cookie / amazon.tld secrets); /drive/v1/search with filters people:(…).
// - urls: a plain list of image addresses.
//
// The proxy only ever fetches photos it listed itself: a request names a source and a photo id, never a URL.

const LIST_TTL = 30 * 60_000;
const MAX_PHOTOS = 1500;
const PAGE = 200;

export interface Listed {
  id: string;
  /** Where the full image is; for Amazon a temporary link that takes ?viewBox=W,H. */
  url: string;
  w: number;
  h: number;
  taken: string | null;
}

// ---- Amazon shared albums ----

export function parseShareUrl(url: string): { origin: string; shareId: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!/^(www\.)?amazon\.(ca|com|co\.uk|de|fr|it|es|com\.au|co\.jp|com\.mx|com\.br|in)$/.test(host)) return null;
    const m = /\/(?:photos|clouddrive)\/share\/([A-Za-z0-9_-]{10,100})/.exec(u.pathname);
    return m?.[1] ? { origin: `https://www.${host.replace(/^www\./, "")}`, shareId: m[1] } : null;
  } catch {
    return null;
  }
}

interface AmazonNode {
  id?: string;
  kind?: string;
  status?: string;
  tempLink?: string;
  contentProperties?: {
    contentType?: string;
    contentDate?: string;
    video?: unknown;
    image?: { width?: number; height?: number; dateTimeOriginal?: string; orientation?: string | number };
  };
}

async function amazonJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Everydaypane photo frame)", ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    // Logged with the path only (the query holds the share id), so the reason shows in Vercel's logs and Sentry.
    console.error(`[photos] Amazon answered ${r.status} for ${new URL(url).pathname}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    if (r.status === 401 || r.status === 403) throw new Error("Amazon refused: the album isn't shared with a link, or the sign-in expired");
    throw new Error(`Amazon answered ${r.status}`);
  }
  const text = await r.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error(`[photos] Amazon sent ${r.headers.get("content-type") ?? "no type"} instead of JSON for ${new URL(url).pathname}`);
    throw new Error("Amazon sent a web page instead of the album (it may be blocking our server)");
  }
}

/** A photo node as we keep it, or null for videos, folders and anything without a link. */
export function photoFromNode(n: AmazonNode): Listed | null {
  const cp = n.contentProperties;
  if (!n.id || !n.tempLink || cp?.video || !(cp?.contentType ?? "image/").startsWith("image/")) return null;
  if (n.status && n.status !== "AVAILABLE") return null;
  let w = Number(cp?.image?.width) || 0;
  let h = Number(cp?.image?.height) || 0;
  // EXIF orientations 5 to 8 are rotated a quarter turn: the stored width is the shown height.
  if ([5, 6, 7, 8].includes(Number(cp?.image?.orientation))) [w, h] = [h, w];
  const taken = cp?.image?.dateTimeOriginal ?? cp?.contentDate ?? null;
  return { id: n.id, url: n.tempLink, w, h, taken: taken ? taken.slice(0, 10) : null };
}

async function listShare(url: string): Promise<Listed[]> {
  const share = parseShareUrl(url);
  if (!share) throw new Error("Not an Amazon Photos share link");
  const api = `${share.origin}/drive/v1`;
  const common = new URLSearchParams({ shareId: share.shareId, resourceVersion: "V2", ContentType: "JSON" }).toString();
  const info = (await amazonJson(`${api}/shares/${share.shareId}?${common}`)) as { nodeInfo?: { id?: string } };
  const root = info.nodeInfo?.id;
  if (!root) throw new Error("Amazon didn't return the shared album");

  const photos: Listed[] = [];
  const folders: { id: string; depth: number }[] = [{ id: root, depth: 0 }];
  let visited = 0;
  // A big album with many folders must not keep a display waiting: list for at most 20 seconds and keep what came.
  const deadline = Date.now() + 20_000;
  while (folders.length && photos.length < MAX_PHOTOS && visited < 100 && Date.now() < deadline) {
    const folder = folders.shift();
    if (!folder) break;
    visited++;
    for (let offset = 0; photos.length < MAX_PHOTOS;) {
      const page = (await amazonJson(
        `${api}/nodes/${folder.id}/children?asset=ALL&limit=${PAGE}&offset=${offset}&tempLink=true&searchOnFamily=false&${common}`,
      )) as { data?: AmazonNode[]; count?: number };
      const data = page.data ?? [];
      for (const n of data) {
        if (n.kind && n.kind !== "FILE") {
          if (n.id && folder.depth < 3) folders.push({ id: n.id, depth: folder.depth + 1 });
          continue;
        }
        const p = photoFromNode(n);
        if (p) photos.push(p);
      }
      offset += data.length;
      if (!data.length || offset >= (page.count ?? 0)) break;
    }
  }
  return photos;
}

// ---- Amazon people (needs the admin's cookies) ----

async function amazonSession(): Promise<{ origin: string; headers: Record<string, string> }> {
  const cookie = await getSecret("amazon.cookie");
  if (!cookie) throw new Error("Amazon isn't signed in");
  const tld = (await getSecret("amazon.tld")) || "ca";
  const sessionId = /(?:^|;\s*)session-id=([^;]+)/.exec(cookie)?.[1] ?? "";
  return { origin: `https://www.amazon.${tld}`, headers: { Cookie: cookie, "x-amzn-sessionid": sessionId } };
}

/** The filter Amazon's search takes for photos of any of these people (face group ids). */
export const peopleFilter = (ids: string[]) =>
  `type:(PHOTOS) AND people:(${ids
    .map((id) => id.replace(/[^A-Za-z0-9_-]/g, ""))
    .filter(Boolean)
    .join(" OR ")})`;

async function listPeople(personIds: string[]): Promise<Listed[]> {
  if (!personIds.length) return [];
  const s = await amazonSession();
  const photos: Listed[] = [];
  for (let offset = 0; photos.length < MAX_PHOTOS;) {
    const q = new URLSearchParams({
      asset: "ALL",
      tempLink: "true",
      resourceVersion: "V2",
      ContentType: "JSON",
      limit: String(PAGE),
      offset: String(offset),
      filters: peopleFilter(personIds),
      searchContext: "customer",
      sort: "['contentProperties.contentDate DESC']",
    });
    const page = (await amazonJson(`${s.origin}/drive/v1/search?${q}`, s.headers)) as { data?: AmazonNode[]; count?: number };
    const data = page.data ?? [];
    for (const n of data) {
      const p = photoFromNode(n);
      if (p) photos.push(p);
    }
    offset += data.length;
    if (!data.length || offset >= (page.count ?? 0)) break;
  }
  return photos;
}

export interface AmazonPerson {
  id: string;
  name: string;
  count: number;
}

/** Face groups for the admin panel's picker. Amazon's answer isn't documented, so anything person-shaped is accepted. */
export function trimPeople(raw: unknown): AmazonPerson[] {
  const out = new Map<string, AmazonPerson>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 5 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const o = v as Record<string, unknown>;
    const id = typeof o.value === "string" ? o.value : typeof o.clusterId === "string" ? o.clusterId : null;
    if (id && /^[A-Za-z0-9_-]{6,128}$/.test(id)) {
      const search = (o.searchData ?? {}) as Record<string, unknown>;
      const name = [o.label, search.clusterName, o.name, o.clusterName].find((n) => typeof n === "string" && n.trim()) as
        string | undefined;
      out.set(id, { id, name: (name ?? "Unnamed person").slice(0, 60), count: Number(o.count) || 0 });
      return;
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  visit(raw, 0);
  return [...out.values()].sort((a, b) => b.count - a.count).slice(0, 100);
}

export async function amazonPeople(): Promise<AmazonPerson[]> {
  const s = await amazonSession();
  const q = new URLSearchParams({ aggregationContext: "all", category: "allPeople", resourceVersion: "V2", ContentType: "JSON" });
  return trimPeople(await amazonJson(`${s.origin}/drive/v1/search/aggregation?${q}`, s.headers));
}

// ---- Listing and serving ----

function listUrls(urls: string[]): Listed[] {
  return urls.slice(0, MAX_PHOTOS).map((url, i) => ({ id: `u${i}`, url, w: 0, h: 0, taken: null }));
}

async function list(source: PhotoSource): Promise<Listed[]> {
  switch (source.kind) {
    case "amazonShare":
      return listShare(source.url);
    case "amazonPeople":
      return listPeople(source.personIds);
    case "urls":
      return listUrls(source.urls);
  }
}

// Keyed by the source's settings too, so editing a source lists it again.
const sourceKey = (s: PhotoSource) => `photos:${s.id}:${hash(JSON.stringify(s))}`;

async function listed(source: PhotoSource, now = Date.now()): Promise<Listed[]> {
  return (await cached(sourceKey(source), LIST_TTL, () => list(source), now)).value;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** What displays get: each source's photos as ids and sizes. A source that fails is reported, not fatal. */
export async function photosFeed(config: DashboardConfig, now = Date.now()): Promise<PhotoData> {
  const sources = config.integrations.photos.sources;
  const results = await Promise.allSettled(sources.map((s) => listed(s, now)));
  const out: PhotoData = { updatedAt: now, sources: {} };
  results.forEach((r, i) => {
    const s = sources[i];
    if (!s) return;
    out.sources[s.id] =
      r.status === "fulfilled"
        ? { photos: r.value.map((p): PhotoItem => [p.id, p.w, p.h, p.taken ?? ""]), error: null }
        : { photos: [], error: r.reason instanceof Error ? r.reason.message : "Couldn't load these photos" };
    if (r.status === "rejected") console.error(`[photos] ${s.kind} source ${s.id} failed:`, r.reason);
  });
  return out;
}

/** Fetches one listed photo at about the size asked for. */
export async function photoImage(config: DashboardConfig, sourceId: string, photoId: string, width: number): Promise<Response | null> {
  const source = config.integrations.photos.sources.find((s) => s.id === sourceId);
  if (!source) return null;
  const find = async () => (await listed(source)).find((p) => p.id === photoId) ?? null;
  let photo = await find();
  if (!photo) return null;
  const w = Math.min(3840, Math.max(160, Math.round(width)));
  const sized = (p: Listed) => (source.kind === "urls" ? p.url : `${p.url}${p.url.includes("?") ? "&" : "?"}viewBox=${w},${w}`);
  const get = (p: Listed) =>
    fetch(sized(p), { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (Everydaypane photo frame)" } });
  let r = await get(photo);
  if ([403, 404, 410].includes(r.status) && source.kind !== "urls") {
    // Amazon's temporary links expire: list again and retry once.
    await forget(sourceKey(source));
    photo = await find();
    if (!photo) return null;
    r = await get(photo);
  }
  if (!r.ok) {
    console.error(`[photos] photo ${source.kind} answered ${r.status} (${r.headers.get("content-type") ?? "no type"})`);
    return null;
  }
  // Amazon's download links often say "binary/octet-stream", so the type is read from the picture itself.
  const bytes = new Uint8Array(await r.arrayBuffer());
  const type = imageType(bytes, r.headers.get("content-type") ?? "");
  if (!type) {
    console.error(`[photos] photo ${source.kind} wasn't a picture the screen can show (${r.headers.get("content-type") ?? "no type"})`);
    return null;
  }
  return new Response(bytes, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}

/** The image type from a picture's first bytes (JPEG, PNG, GIF, WebP, AVIF), or the header's if it names one. */
export function imageType(b: Uint8Array, header: string): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
  // HEIC (iPhone photos) can't be drawn by most browsers, so it doesn't count.
  return /^image\/(jpeg|png|gif|webp|avif)/.test(header) ? (header.split(";")[0] ?? null) : null;
}

/** For the admin panel: whether each source lists, and whether its first photo comes through. */
export async function checkSources(
  config: DashboardConfig,
): Promise<Record<string, { count: number; error: string | null; image: string | null }>> {
  const out: Record<string, { count: number; error: string | null; image: string | null }> = {};
  for (const s of config.integrations.photos.sources) {
    try {
      const list = await listed(s);
      const first = list[0];
      const img = first ? await photoImage(config, s.id, first.id, 480).catch(() => null) : null;
      out[s.id] = { count: list.length, error: null, image: first ? (img ? null : "Its photos didn't load: see the server log") : null };
    } catch (error) {
      out[s.id] = { count: 0, error: error instanceof Error ? error.message : "Couldn't list it", image: null };
    }
  }
  return out;
}
