// The display's only door to the server. Every request carries the device token in a header (never logged in URLs),
// responses are kept so a widget can render the last good data at once, and failures flip the display to offline mode
// (the service worker serves the last copies; src/display/sw.ts).

const body = document.body;
export const TOKEN = body.dataset.token ?? "";
export const PREVIEW = body.dataset.preview ?? "";
/** Forced day/night in an admin preview; empty on a real display. Mutable so the preview can swap without a reload. */
export let previewMode: "" | "day" | "night" =
  body.dataset.previewMode === "day" || body.dataset.previewMode === "night" ? body.dataset.previewMode : "";

export function setPreviewMode(mode: "day" | "night") {
  previewMode = mode;
  body.dataset.previewMode = mode;
  // Keep the address in sync so a refresh stays on the same mode.
  if (PREVIEW && typeof history !== "undefined") {
    const url = new URL(location.href);
    url.searchParams.set("mode", mode);
    history.replaceState(null, "", url);
  }
}

type Listener = () => void;
const offlineListeners = new Set<Listener>();
const activityListeners = new Set<Listener>();
export let offline = false;
export let connectionStatus: "online" | "browser-offline" | "server-offline" = navigator.onLine === false ? "browser-offline" : "online";
let activeRequests = 0;
let browserOffline = navigator.onLine === false;
let serverOffline = false;

function setConnectionStatus() {
  const next = browserOffline ? "browser-offline" : serverOffline ? "server-offline" : "online";
  const nextOffline = next !== "online";
  if (offline === nextOffline && connectionStatus === next) return;
  offline = nextOffline;
  connectionStatus = next;
  for (const l of offlineListeners) l();
}
export const onOfflineChange = (l: Listener) => offlineListeners.add(l);

function setServerOffline(value: boolean) {
  serverOffline = value;
  setConnectionStatus();
}

function activityChanged() {
  for (const l of activityListeners) l();
}

export function beginActivity(): () => void {
  activeRequests += 1;
  activityChanged();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeRequests = Math.max(0, activeRequests - 1);
    activityChanged();
  };
}

export function isUpdating(): boolean {
  return activeRequests > 0;
}

export const onActivityChange = (l: Listener) => activityListeners.add(l);

export function retryDelay(intervalMs: number, failures: number, capMs = 15 * 60_000): number {
  return Math.min(intervalMs * 2 ** (failures - 1), capMs > intervalMs ? capMs : intervalMs);
}

export function apiUrl(path: string, params: Record<string, string> = {}): string {
  const queryAt = path.indexOf("?");
  const route = queryAt < 0 ? path : path.slice(0, queryAt);
  const q = new URLSearchParams(queryAt < 0 ? "" : path.slice(queryAt + 1));
  for (const [key, value] of Object.entries(params)) q.set(key, value);
  if (PREVIEW) q.set("view", PREVIEW);
  const s = q.toString();
  return `/api/display/${route.replace(/\/$/, "")}/${s ? `?${s}` : ""}`;
}

export async function get<T>(
  path: string,
  params: Record<string, string> = {},
  etag?: string,
  opts: { background?: boolean } = {},
): Promise<{
  data: T | null;
  etag: string | null;
  notModified: boolean;
  live: boolean;
  releaseVersion: string | null;
  unauthorized: boolean;
}> {
  const headers: Record<string, string> = {};
  if (TOKEN) headers["x-display-token"] = TOKEN;
  if (etag) headers["if-none-match"] = etag;
  // A background request (the config-watch long-poll, held open until the settings change) never shows "Updating":
  // it is open nearly all the time on a Household wall, so the notice would never go away (Melvin, 2026-11-25).
  const endActivity = opts.background ? () => undefined : beginActivity();
  try {
    const r = await fetch(apiUrl(path, params), { headers, credentials: "same-origin" });
    // The service worker marks answers it served from its offline copy.
    const offlineCopy = r.headers.get("x-offline") === "1";
    const releaseVersion = r.headers.get("x-display-release");
    setServerOffline(offlineCopy || r.status >= 500);
    if (r.status === 304)
      return {
        data: null,
        etag: etag ?? null,
        notModified: true,
        live: !offlineCopy,
        releaseVersion,
        unauthorized: false,
      };
    if (!r.ok)
      return {
        data: null,
        etag: null,
        notModified: false,
        live: false,
        releaseVersion,
        unauthorized: r.status === 401 || r.status === 403,
      };
    if (r.status === 204)
      return { data: null, etag: r.headers.get("etag"), notModified: false, live: true, releaseVersion, unauthorized: false };
    try {
      const data = (await r.json()) as T;
      return { data, etag: r.headers.get("etag"), notModified: false, live: !offlineCopy, releaseVersion, unauthorized: false };
    } catch {
      // A reverse proxy or stale deployment may return HTML or an empty 200. It is not
      // safe to treat that as widget data; keep the last good copy and retry with backoff.
      return { data: null, etag: null, notModified: false, live: false, releaseVersion, unauthorized: false };
    }
  } catch {
    setServerOffline(true);
    return { data: null, etag: null, notModified: false, live: false, releaseVersion: null, unauthorized: false };
  } finally {
    endActivity();
  }
}

export function post(path: string, payload: unknown): void {
  void send(path, payload);
}

/** Posts and says whether the server took it. */
export async function send(path: string, payload: unknown): Promise<boolean> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) headers["x-display-token"] = TOKEN;
  const endActivity = beginActivity();
  try {
    const r = await fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(payload), credentials: "same-origin" });
    setServerOffline(r.status >= 500);
    return r.ok;
  } catch {
    setServerOffline(true);
    return false;
  } finally {
    endActivity();
  }
}

/** Posts and returns null when the server took it, or why not (the server's own words when it gave some). */
export async function sendExplained(path: string, payload: unknown): Promise<string | null> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) headers["x-display-token"] = TOKEN;
  const endActivity = beginActivity();
  try {
    const r = await fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(payload), credentials: "same-origin" });
    setServerOffline(r.status >= 500);
    if (r.ok) return null;
    const body = (await r.json().catch(() => ({}))) as { error?: unknown };
    return r.status === 502 && typeof body.error === "string" ? body.error.slice(0, 80) : "";
  } catch {
    setServerOffline(true);
    return "";
  } finally {
    endActivity();
  }
}

/**
 * Image URLs for `<img src>`. Auth is the short-lived `ep_display` cookie (set when `/display/` unlocks) or an admin
 * session cookie in preview — never the long-lived device token in the query string (CDN/access logs).
 */
export function imageUrl(path: string, params: Record<string, string>): string {
  return apiUrl(path, params);
}

// ---- Shared data feeds: widgets of the same kind share one fetch and one timer. ----

interface Feed<T> {
  data: T | null;
  listeners: Set<(data: T) => void>;
  timer: number | undefined;
  load: () => Promise<void>;
  /** Bumps when a load is superseded, so a late response doesn't paint or schedule another. */
  generation: number;
  loading: boolean;
  failures: number;
  etag: string | undefined;
}
const feeds = new Map<string, Feed<unknown>>();

function canPoll(): boolean {
  return !document.hidden && navigator.onLine !== false;
}

function schedule<T>(feed: Feed<T>, delayMs: number): void {
  window.clearTimeout(feed.timer);
  feed.timer = undefined;
  if (feed.listeners.size === 0 || !canPoll()) return;
  feed.timer = window.setTimeout(() => void feed.load(), delayMs);
}

function pauseFeeds(): void {
  for (const feed of feeds.values()) {
    window.clearTimeout(feed.timer);
    feed.timer = undefined;
  }
}

function resumeFeeds(): void {
  if (!canPoll()) return;
  let index = 0;
  for (const feed of feeds.values()) {
    if (feed.loading || feed.timer !== undefined) continue;
    schedule(feed, Math.min(index++ * 100, 2000));
  }
}

document.addEventListener("visibilitychange", () => (document.hidden ? pauseFeeds() : resumeFeeds()));
window.addEventListener("offline", () => {
  browserOffline = true;
  setConnectionStatus();
  pauseFeeds();
});
window.addEventListener("online", () => {
  browserOffline = false;
  setConnectionStatus();
  resumeFeeds();
});

export function subscribe<T>(path: string, everyMs: number, listener: (data: T) => void): () => void {
  let feed = feeds.get(path) as Feed<T> | undefined;
  if (!feed) {
    const f: Feed<T> = {
      data: null,
      listeners: new Set(),
      timer: undefined,
      load: async () => undefined,
      generation: 0,
      loading: false,
      failures: 0,
      etag: undefined,
    };
    feed = f;
    feeds.set(path, f as Feed<unknown>);
    const load = async () => {
      if (f.loading || !canPoll()) return;
      const gen = ++f.generation;
      f.loading = true;
      f.timer = undefined;
      const result = await get<T>(path, {}, f.etag);
      // Unsubscribed, or refresh() started a newer load, while this one was in flight.
      if (gen !== f.generation || feeds.get(path) !== f) return;
      f.loading = false;
      if (result.etag) f.etag = result.etag;
      if (result.data !== null) {
        f.data = result.data;
        for (const l of f.listeners) l(result.data);
      }
      if (gen !== f.generation || feeds.get(path) !== f) return;
      f.failures = result.live ? 0 : f.failures + 1;
      schedule(f, result.live ? everyMs : retryDelay(everyMs, f.failures));
    };
    f.load = load;
  }
  const f = feed;
  f.listeners.add(listener);
  if (f.data !== null) listener(f.data);
  else if (f.listeners.size === 1) schedule(f, 0);
  return () => {
    f.listeners.delete(listener);
    if (f.listeners.size === 0) {
      window.clearTimeout(f.timer);
      feeds.delete(path);
      return;
    }
  };
}

/** Fetches a feed now instead of at its next tick (after a tap changed something). */
export function refresh(path: string): void {
  const f = feeds.get(path);
  if (!f) return;
  if (f.loading) {
    f.generation += 1;
    f.loading = false;
  }
  schedule(f, 0);
}
