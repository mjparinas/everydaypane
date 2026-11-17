// The display's only door to the server. Every request carries the device token in a header (never logged in URLs),
// responses are kept so a widget can render the last good data at once, and failures flip the display to offline mode
// (the service worker serves the last copies; src/display/sw.ts).

const body = document.body;
export const TOKEN = body.dataset.token ?? "";
export const PREVIEW = body.dataset.preview ?? "";

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

/** Image URLs can't send headers, so they carry the token as ?t= (only our own routes read it). */
export function imageUrl(path: string, params: Record<string, string>): string {
  return apiUrl(path, TOKEN ? { ...params, t: TOKEN } : params);
}

// ---- Shared data feeds: widgets of the same kind share one fetch and one timer. ----

interface Feed<T> {
  data: T | null;
  listeners: Set<(data: T) => void>;
  timer: number | undefined;
  load: () => Promise<void>;
}
const feeds = new Map<string, Feed<unknown>>();

export function subscribe<T>(path: string, everyMs: number, listener: (data: T) => void): () => void {
  let feed = feeds.get(path) as Feed<T> | undefined;
  if (!feed) {
    const f: Feed<T> = { data: null, listeners: new Set(), timer: undefined, load: async () => undefined };
    feed = f;
    feeds.set(path, f as Feed<unknown>);
    const load = async () => {
      window.clearTimeout(f.timer);
      const { data } = await get<T>(path);
      if (data) {
        f.data = data;
        for (const l of f.listeners) l(data);
      }
      // Back off to a minute while offline, so a dead network isn't hammered.
      f.timer = window.setTimeout(() => void load(), offline ? Math.min(everyMs, 60_000) : everyMs);
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
  void feeds.get(path)?.load();
}
