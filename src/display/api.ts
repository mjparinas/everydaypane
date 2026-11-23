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
export let offline = false;

function setOffline(value: boolean) {
  if (offline === value) return;
  offline = value;
  for (const l of offlineListeners) l();
}
export const onOfflineChange = (l: Listener) => offlineListeners.add(l);

export function apiUrl(path: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  if (PREVIEW) q.set("view", PREVIEW);
  const s = q.toString();
  return `/api/display/${path}/${s ? `?${s}` : ""}`;
}

export async function get<T>(
  path: string,
  params: Record<string, string> = {},
  etag?: string,
): Promise<{ data: T | null; etag: string | null; notModified: boolean }> {
  const headers: Record<string, string> = {};
  if (TOKEN) headers["x-display-token"] = TOKEN;
  if (etag) headers["if-none-match"] = etag;
  try {
    const r = await fetch(apiUrl(path, params), { headers, credentials: "same-origin" });
    // The service worker marks answers it served from its offline copy.
    setOffline(r.headers.get("x-offline") === "1");
    if (r.status === 304) return { data: null, etag: etag ?? null, notModified: true };
    if (!r.ok) return { data: null, etag: null, notModified: false };
    return { data: (await r.json()) as T, etag: r.headers.get("etag"), notModified: false };
  } catch {
    setOffline(true);
    return { data: null, etag: null, notModified: false };
  }
}

export function post(path: string, payload: unknown): void {
  void send(path, payload);
}

/** Posts and says whether the server took it. */
export async function send(path: string, payload: unknown): Promise<boolean> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) headers["x-display-token"] = TOKEN;
  try {
    const r = await fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(payload), credentials: "same-origin" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Posts and returns null when the server took it, or why not (the server's own words when it gave some). */
export async function sendExplained(path: string, payload: unknown): Promise<string | null> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) headers["x-display-token"] = TOKEN;
  try {
    const r = await fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(payload), credentials: "same-origin" });
    if (r.ok) return null;
    const body = (await r.json().catch(() => ({}))) as { error?: unknown };
    return r.status === 502 && typeof body.error === "string" ? body.error.slice(0, 80) : "";
  } catch {
    return "";
  }
}

/**
 * Image URLs for `<img src>`. Auth is the short-lived `ep_display` cookie (set when `/d/<token>/` opens) or an admin
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
}
const feeds = new Map<string, Feed<unknown>>();

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
    };
    feed = f;
    feeds.set(path, f as Feed<unknown>);
    const load = async () => {
      const gen = ++f.generation;
      f.loading = true;
      window.clearTimeout(f.timer);
      f.timer = undefined;
      const { data } = await get<T>(path);
      // Unsubscribed, or refresh() started a newer load, while this one was in flight.
      if (gen !== f.generation || feeds.get(path) !== f) return;
      f.loading = false;
      if (data) {
        f.data = data;
        for (const l of f.listeners) l(data);
      }
      if (gen !== f.generation || feeds.get(path) !== f) return;
      // Back off to at least a minute while offline, so a dead network isn't hammered.
      f.timer = window.setTimeout(() => void load(), offline ? Math.max(everyMs, 60_000) : everyMs);
    };
    f.load = load;
    void load();
  } else if (feed.data) {
    listener(feed.data);
  }
  feed.listeners.add(listener);
  const f = feed;
  return () => {
    f.listeners.delete(listener);
    if (f.listeners.size === 0) {
      window.clearTimeout(f.timer);
      feeds.delete(path);
    }
  };
}

/** Fetches a feed now instead of at its next tick (after a tap changed something). */
export function refresh(path: string): void {
  const f = feeds.get(path);
  if (!f) return;
  window.clearTimeout(f.timer);
  f.timer = undefined;
  if (f.loading) {
    f.generation += 1;
    f.loading = false;
  }
  void f.load();
}
