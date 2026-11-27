import "server-only";

import type { DashboardConfig, PhotoSource } from "@/lib/config/schema";
import type { PhotoData, PhotoItem } from "@/lib/display/types";

import { cached } from "./cache";
import { libraryImage, listLibrary } from "./library";
import { listBingPotd } from "./photos/bing";
import { boxImage, listBox } from "./photos/box";
import { dropboxImage, listDropbox } from "./photos/dropbox";
import { listFlickr } from "./photos/flickr";
import { immichImage, listImmich } from "./photos/immich";
import { listOnedrive } from "./photos/onedrive";
import { listReddit } from "./photos/reddit";
import { listSmugmug } from "./photos/smugmug";
import { MAX_PHOTOS, type Listed } from "./photos/types";
import { listWeatherAlbums } from "./photos/weatherAlbums";
import { fetchPublicHttps, publicHttpsUrl } from "./publicUrl";
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
// Amazon turns cloud servers away now and then (a 503 robot page, seen 2026-11-17). So Amazon albums are listed rarely,
// the last good list is kept and served while Amazon refuses, a refusal isn't retried for a while, and requests are
// spaced out. This only waits and tries again later, as a 503 asks; it never disguises who is asking.
const AMAZON_TTL = 6 * 60 * 60_000;
const RETRY_AFTER_FAILURE = 20 * 60_000;

/** Waits between Amazon requests (tests make it instant). */
export const timing = { pause: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
const MAX_AMAZON_SHARE_PHOTOS = 5000;
const PAGE = 200;
const SHARE_LIST_MS = 45_000;

export type { Listed } from "./photos/types";

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

async function amazonJson(url: string, headers: Record<string, string> = {}, deadline = Infinity): Promise<unknown> {
  const get = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Amazon took too long to list the album");
    return fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Everydaypane photo frame)", ...headers },
      signal: AbortSignal.timeout(Math.min(15_000, remaining)),
    });
  };
  let r = await get();
  // A 503 means "busy, come back later": wait as long as Amazon asks (a few seconds at most here) and try once more.
  if (r.status === 503 || r.status === 429) {
    const wait = Math.min(10, Math.max(2, Number(r.headers.get("retry-after")) || 4));
    await r.body?.cancel().catch(() => undefined);
    if (Date.now() + wait * 1000 >= deadline) throw new Error("Amazon took too long to list the album");
    await timing.pause(wait * 1000);
    r = await get();
  }
  if (!r.ok) {
    // Logged with the path only (the query holds the share id), so the reason shows in Vercel's logs and Sentry.
    console.error(`[photos] Amazon answered ${r.status} for ${new URL(url).pathname}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    if (r.status === 401 || r.status === 403) throw new Error("Amazon refused: the album isn't shared with a link, or the sign-in expired");
    if (r.status === 503 || r.status === 429)
      throw new Error("Amazon is turning our server away right now (503). The dashboard will try again in a while.");
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

/** A cold album can show what loaded while it waits to retry, but only complete lists go in the cache. */
class IncompleteAlbum extends Error {
  constructor(
    readonly photos: Listed[],
    cause: unknown,
  ) {
    super("Couldn't finish loading the Amazon album", { cause });
  }
}

async function listShare(url: string): Promise<Listed[]> {
  const share = parseShareUrl(url);
  if (!share) throw new Error("Not an Amazon Photos share link");
  const api = `${share.origin}/drive/v1`;
  const common = new URLSearchParams({ shareId: share.shareId, resourceVersion: "V2", ContentType: "JSON" }).toString();
  const deadline = Date.now() + SHARE_LIST_MS;
  const info = (await amazonJson(`${api}/shares/${share.shareId}?${common}`, {}, deadline)) as { nodeInfo?: { id?: string } };
  const root = info.nodeInfo?.id;
  if (!root) throw new Error("Amazon didn't return the shared album");

  // Amazon's default order can repeat IDs across pages and omit other photos.
  const sort = encodeURIComponent(JSON.stringify(["name ASC", "createdDate ASC"]));
  const photos = new Map<string, Listed>();
  const folders: { id: string; depth: number }[] = [{ id: root, depth: 0 }];
  let visited = 0;
  while (folders.length && photos.size < MAX_AMAZON_SHARE_PHOTOS && visited < 100) {
    const folder = folders.shift();
    if (!folder) break;
    visited++;
    for (let offset = 0; photos.size < MAX_AMAZON_SHARE_PHOTOS;) {
      let page: { data?: AmazonNode[]; count?: number };
      try {
        if (Date.now() + 500 >= deadline) throw new Error("Amazon took too long to list the album");
        await timing.pause(500);
        page = (await amazonJson(
          `${api}/nodes/${folder.id}/children?asset=ALL&limit=${PAGE}&offset=${offset}&tempLink=true&searchOnFamily=false&sort=${sort}&${common}`,
          {},
          deadline,
        )) as { data?: AmazonNode[]; count?: number };
      } catch (error) {
        if (photos.size) throw new IncompleteAlbum([...photos.values()], error);
        throw error;
      }
      const data = page.data ?? [];
      for (const n of data) {
        if (n.kind && n.kind !== "FILE") {
          if (n.id && folder.depth < 3) folders.push({ id: n.id, depth: folder.depth + 1 });
          continue;
        }
        const p = photoFromNode(n);
        if (p) photos.set(p.id, p);
      }
      offset += data.length;
      if (!data.length || offset >= (page.count ?? 0)) break;
    }
  }
  return [...photos.values()].slice(0, MAX_AMAZON_SHARE_PHOTOS);
}

// ---- Amazon people (needs the admin's cookies) ----

async function amazonSession(accountId: string): Promise<{ origin: string; headers: Record<string, string> }> {
  const cookie = await getSecret(accountId, "amazon.cookie");
  if (!cookie) throw new Error("Amazon isn't signed in");
  const tld = (await getSecret(accountId, "amazon.tld")) || "ca";
  const sessionId = /(?:^|;\s*)session-id=([^;]+)/.exec(cookie)?.[1] ?? "";
  return { origin: `https://www.amazon.${tld}`, headers: { Cookie: cookie, "x-amzn-sessionid": sessionId } };
}

/** The filter Amazon's search takes for photos of any of these people (face group ids). */
export const peopleFilter = (ids: string[]) =>
  `type:(PHOTOS) AND people:(${ids
    .map((id) => id.replace(/[^A-Za-z0-9_-]/g, ""))
    .filter(Boolean)
    .join(" OR ")})`;

async function listPeople(accountId: string, personIds: string[]): Promise<Listed[]> {
  if (!personIds.length) return [];
  const s = await amazonSession(accountId);
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

export async function amazonPeople(accountId: string): Promise<AmazonPerson[]> {
  const s = await amazonSession(accountId);
  const q = new URLSearchParams({ aggregationContext: "all", category: "allPeople", resourceVersion: "V2", ContentType: "JSON" });
  return trimPeople(await amazonJson(`${s.origin}/drive/v1/search/aggregation?${q}`, s.headers));
}

// ---- Listing and serving ----

function listUrls(urls: string[]): Listed[] {
  return urls
    .filter((url) => publicHttpsUrl(url))
    .slice(0, MAX_PHOTOS)
    .map((url, i) => ({ id: `u${i}`, url, w: 0, h: 0, taken: null }));
}

async function list(accountId: string, config: DashboardConfig, source: PhotoSource): Promise<Listed[]> {
  switch (source.kind) {
    case "amazonShare":
      return listShare(source.url);
    case "amazonPeople":
      return listPeople(accountId, source.personIds);
    case "urls":
    case "icloudPublished":
      return listUrls(source.urls);
    case "library":
      return (await listLibrary(accountId, source.id)).map((p) => ({ id: p.id, url: p.pathname, w: p.w, h: p.h, taken: p.taken }));
    case "bingPotd":
      return listBingPotd();
    case "reddit":
      return listReddit(source.subreddit, source.sort);
    case "weatherAlbums":
      return listWeatherAlbums(accountId, config, source);
    case "immich":
      return listImmich(accountId, source.id, source.baseUrl);
    case "dropbox":
      return listDropbox(accountId, source.path);
    case "onedrive":
      return listOnedrive(accountId, source.folderId);
    case "box":
      return listBox(accountId, source.folderId);
    case "flickr":
      return listFlickr(accountId, source.userId, source.photosetId);
    case "smugmug":
      return listSmugmug(accountId, source.albumKey);
  }
}

// Keyed by household + source settings, so two accounts never share a listed album.
const sourceKey = (accountId: string, s: PhotoSource) => `photos:${accountId}:${s.id}:${hash(JSON.stringify(s))}`;

const failures = new Map<string, { at: number; error: unknown }>();

async function listed(accountId: string, config: DashboardConfig, source: PhotoSource, now = Date.now()): Promise<Listed[]> {
  // Our own library is a quick database read, and must show a new upload at once: never cached.
  if (source.kind === "library" || source.kind === "weatherAlbums") return list(accountId, config, source);
  const key = sourceKey(accountId, source);
  const ttl =
    source.kind === "urls" || source.kind === "icloudPublished"
      ? LIST_TTL
      : source.kind === "bingPotd"
        ? 24 * 60 * 60_000
        : source.kind === "reddit"
          ? 30 * 60_000
          : AMAZON_TTL;
  const failed = failures.get(key);
  const recentFailure = failed && now - failed.at < RETRY_AFTER_FAILURE ? failed : undefined;
  try {
    // During backoff, read the last good list without starting another upstream request.
    const result = await cached(
      key,
      recentFailure ? Infinity : ttl,
      () => (recentFailure ? Promise.reject(recentFailure.error) : list(accountId, config, source)),
      now,
    );
    if (!recentFailure) {
      if (result.stale) failures.set(key, { at: now, error: new Error("Amazon refused; showing the last list") });
      else failures.delete(key);
    }
    return result.value;
  } catch (error) {
    if (!recentFailure) failures.set(key, { at: now, error });
    if (error instanceof IncompleteAlbum) return error.photos;
    throw error;
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** What displays get: each source's photos as ids and sizes. A source that fails is reported, not fatal. */
export async function photosFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<PhotoData> {
  const sources = config.integrations.photos.sources;
  const results = await Promise.allSettled(sources.map((s) => listed(accountId, config, s, now)));
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
export async function photoImage(
  accountId: string,
  config: DashboardConfig,
  sourceId: string,
  photoId: string,
  width: number,
): Promise<Response | null> {
  const source = config.integrations.photos.sources.find((s) => s.id === sourceId);
  if (!source) return null;
  const find = async () => (await listed(accountId, config, source)).find((p) => p.id === photoId) ?? null;
  let photo = await find();
  if (!photo) return null;
  if (source.kind === "library") return libraryImage(photo.url);
  if (source.kind === "immich") {
    const ir = await immichImage(accountId, source.id, source.baseUrl, photoId, width);
    if (!ir.ok) return null;
    const bytes = new Uint8Array(await ir.arrayBuffer());
    const type = imageType(bytes, ir.headers.get("content-type") ?? "");
    return type ? new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } }) : null;
  }
  if (source.kind === "dropbox" && photo.url.startsWith("dropbox:")) {
    const path = decodeURIComponent(photo.url.slice("dropbox:".length));
    const dr = await dropboxImage(accountId, path);
    if (!dr.ok) return null;
    const bytes = new Uint8Array(await dr.arrayBuffer());
    const type = imageType(bytes, dr.headers.get("content-type") ?? "") ?? "image/jpeg";
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  }
  if (source.kind === "box" && photo.url.startsWith("box:")) {
    const br = await boxImage(accountId, photo.url.slice("box:".length));
    if (!br.ok) return null;
    const bytes = new Uint8Array(await br.arrayBuffer());
    const type = imageType(bytes, br.headers.get("content-type") ?? "");
    return type ? new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } }) : null;
  }
  const w = Math.min(3840, Math.max(160, Math.round(width)));
  const direct =
    source.kind === "urls" ||
    source.kind === "icloudPublished" ||
    source.kind === "bingPotd" ||
    source.kind === "reddit" ||
    source.kind === "flickr" ||
    source.kind === "smugmug" ||
    source.kind === "onedrive";
  const sized = (p: Listed) => (direct ? p.url : `${p.url}${p.url.includes("?") ? "&" : "?"}viewBox=${w},${w}`);
  const init = { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (Everydaypane photo frame)" } };
  const get = (p: Listed) => (direct ? fetchPublicHttps(p.url, init) : fetch(sized(p), init));
  let r: Response;
  try {
    r = await get(photo);
  } catch (error) {
    if (direct) return null;
    throw error;
  }
  if ([403, 404, 410].includes(r.status) && !direct) {
    // Amazon's temporary links expire: list again and retry once. The old list stays if Amazon refuses, and a recent
    // refusal isn't asked again.
    const key = sourceKey(accountId, source);
    const failed = failures.get(key);
    if (failed && Date.now() - failed.at < RETRY_AFTER_FAILURE) return null;
    const fresh = await cached(key, 0, () => list(accountId, config, source));
    if (fresh.stale) failures.set(key, { at: Date.now(), error: new Error("Amazon refused; showing the last list") });
    photo = fresh.value.find((p) => p.id === photoId) ?? null;
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

/** Tests only. */
export function resetPhotosForTests(): void {
  failures.clear();
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
  accountId: string,
  config: DashboardConfig,
): Promise<Record<string, { count: number; error: string | null; image: string | null }>> {
  const out: Record<string, { count: number; error: string | null; image: string | null }> = {};
  for (const s of config.integrations.photos.sources) {
    try {
      const list = await listed(accountId, config, s);
      const first = list[0];
      const img = first ? await photoImage(accountId, config, s.id, first.id, 480).catch(() => null) : null;
      out[s.id] = { count: list.length, error: null, image: first ? (img ? null : "Its photos didn't load: see the server log") : null };
    } catch (error) {
      out[s.id] = { count: 0, error: error instanceof Error ? error.message : "Couldn't list it", image: null };
    }
  }
  return out;
}
