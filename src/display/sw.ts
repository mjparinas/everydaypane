// Offline mode (Melvin, 2026-11-17). The display keeps working when the internet drops: its page, script, styles and
// fonts come from this cache, and every data request falls back to the last good answer (marked x-offline: 1, so the
// display shows a small "Offline" note). Data is fetched network-first, so nothing stale is shown while online.
//
// Typed with a small local interface rather than the WebWorker lib, which can't share a program with the DOM lib.

interface FetchEventLike extends Event {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface ExtendableEventLike extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface WindowClientLike {
  url: string;
}
interface ServiceWorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type?: "window" }): Promise<WindowClientLike[]>;
  };
  addEventListener(type: "install" | "activate", l: (e: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", l: (e: FetchEventLike) => void): void;
}

const sw = self as unknown as ServiceWorkerScope;
const VERSION = new URLSearchParams(sw.location.search).get("v") ?? "dev";
const SHELL = `ep-shell-${VERSION}`;
const DATA = "ep-data";
const FONTS = [
  "/fonts/inter.woff2",
  "/fonts/manrope.woff2",
  "/fonts/space-grotesk.woff2",
  "/fonts/outfit.woff2",
  "/fonts/dm-sans.woff2",
  "/fonts/literata.woff2",
];

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll([`/display/display.js?v=${VERSION}`, `/display/display.css?v=${VERSION}`, "/icon.svg", "/brand/mark.svg", ...FONTS]),
      )
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ep-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
      .then(() => sw.clients.matchAll({ type: "window" }))
      .then(async (clients) => {
        const cache = await caches.open(DATA);
        // The page itself, so a reload while offline still opens the dashboard and not just its last JSON.
        await Promise.all(
          clients.map(async (client) => {
            const path = new URL(client.url).pathname;
            // Only the unlocked wall document — not `/display/unlock/`.
            if (path !== "/display/" && path !== "/display") return;
            try {
              // redirect:manual so a locked 307 to /display/unlock/ is never stored as /display/.
              await cache.delete(path);
              const r = await fetch(path, { redirect: "manual", credentials: "same-origin", cache: "no-store" });
              if (r.status === 200) await cache.put(path, r);
            } catch {
              // The next visit fills this in.
            }
          }),
        );
      }),
  );
});

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function offlineCopy(req: Request): Promise<Response | undefined> {
  const hit = await (await caches.open(DATA)).match(req, { ignoreVary: true });
  if (!hit) return undefined;
  const headers = new Headers(hit.headers);
  headers.set("x-offline", "1");
  headers.delete("etag");
  return new Response(hit.body, { status: hit.status, headers });
}

function isDisplayDocumentPath(pathname: string): boolean {
  return pathname === "/display/" || pathname === "/display";
}

async function networkFirst(req: Request, key: Request, ms: number): Promise<Response> {
  try {
    const r = await Promise.race([fetch(req), timeout(ms)]);
    if (r.status === 200) {
      const copy = r.clone();
      void caches.open(DATA).then((c) => c.put(key, copy));
    }
    if (r.status >= 500) return (await offlineCopy(key)) ?? r;
    return r;
  } catch {
    return (
      (await offlineCopy(key)) ??
      new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json", "x-offline": "1" } })
    );
  }
}

/** Wall document: do not follow the locked 307 — return it so the browser URL becomes /display/unlock/. */
async function displayDocument(req: Request, ms: number): Promise<Response> {
  const key = new Request(new URL(req.url).pathname);
  try {
    const r = await Promise.race([fetch(req, { redirect: "manual", cache: "no-store" }), timeout(ms)]);
    if (r.status >= 300 && r.status < 400) {
      // Drop any prior mistaken unlock HTML cached under /display/.
      void caches.open(DATA).then((c) => c.delete(key));
      return r;
    }
    if (r.status === 200) {
      void caches.open(DATA).then((c) => c.put(key, r.clone()));
    }
    if (r.status >= 500) return (await offlineCopy(key)) ?? r;
    return r;
  } catch {
    return (
      (await offlineCopy(key)) ?? new Response("Offline", { status: 503, headers: { "content-type": "text/plain", "x-offline": "1" } })
    );
  }
}

async function cacheFirst(req: Request): Promise<Response> {
  const hit = await caches.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) {
    const copy = r.clone();
    void caches.open(SHELL).then((c) => c.put(req, copy));
  }
  return r;
}

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  // Camera frames are live (every one has its own URL): an old frame offline would mislead, and keeping each one
  // would fill the cache.
  if (url.pathname.startsWith("/api/display/camera/")) return;
  // Album art is one address per track and the browser's own cache keeps it (Cache-Control), so the offline copy
  // doesn't collect one picture per song.
  if (url.pathname.startsWith("/api/display/art/")) return;
  // Radar pictures are one address per six minutes and the browser's cache keeps them a day; offline, the loop
  // simply stops at what it has.
  if (url.pathname.startsWith("/api/display/radar/frame/")) return;
  if (req.mode === "navigate" && isDisplayDocumentPath(url.pathname)) {
    e.respondWith(displayDocument(req, 6000));
  } else if (url.pathname.startsWith("/api/display/")) {
    // Keyed by URL alone (the token header is the same for every request from this device).
    e.respondWith(networkFirst(req, new Request(url.pathname + url.search), 10000));
  } else if (/^\/display\/(display\.(js|css)|sw\.js)/.test(url.pathname) || url.pathname.startsWith("/fonts/")) {
    // Shell assets only — not `/display/unlock/` (Next.js gate page).
    e.respondWith(cacheFirst(req));
  }
});
