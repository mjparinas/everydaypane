import type { Widget } from "@/lib/config/schema";
import type { PhotoData, PhotoItem } from "@/lib/display/types";
import {
  caption,
  fitFor,
  MAX_CACHED_TOTAL,
  order,
  orientation,
  pairs,
  partnerIndex,
  pickCachedPhoto,
  pickKey,
  rememberCachedPhoto,
  type CachedPick,
  type Pick,
} from "@/lib/photoFrame";

import { imageUrl, subscribe } from "../api";
import { fill, h } from "../dom";
import { isoDate } from "../format";
import type { Cleanup, WidgetContext } from "./types";

// The photo frame: a slideshow from the chosen sources (all of them when none is chosen). Each photo is a "slide" that
// cross-fades with opacity only, and is loaded before it is shown, at the width the frame draws it, so the proxy sends
// no more pixels than needed. The photo frame polish (Melvin, 2026-11-26: rival Skylight) adds, each switchable:
// smart fit (whole photo over a soft copy of itself when filling would crop a lot), two portraits side by side, a slow
// drift (transform only), "On This Day" photos first and photos added since the frame last looked shown next.
// A small bounded fallback cache (Melvin, 2026-11-27) keeps a handful of loaded photos on disk so a failed or slow
// upstream photo (especially Amazon) swaps in a random cached picture instead of leaving the wall blank.
// The choices are in src/lib/photoFrame.ts.

/** Widths are rounded up to a few steps so the browser and proxy caches get hits. */
const STEPS = [480, 800, 1280, 1920, 2560];
const widthFor = (px: number) => STEPS.find((s) => s >= px * (window.devicePixelRatio || 1)) ?? 2560;
const FADE_MS = 1500;
/** Photos refresh often enough that one a parent adds from their phone shows within minutes; 304 when unchanged. */
const FEED_MS = 5 * 60_000;
const LOAD_TIMEOUT_MS = 30_000;
const PHOTO_CACHE = "ep-photos";
const MAX_SW_PHOTOS = 12;
/** Quietly pre-populate up to 3 fallback photos on disk (no bitmap decode) once the first slide is up. */
const WARM_TARGET = 3;
const WARM_DELAY_MS = 5_000;
const CACHED_KEY = "everydaypane.photos.cached";
/** How many photos a screen remembers having shown, across reloads, so a refresh doesn't open on the same ones. */
const RECENT = 50;
const recentKey = (id: string) => `everydaypane.photos.recent.${id}`;
const loadRecent = (id: string): string[] => {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(recentKey(id)) ?? "[]");
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string").slice(-RECENT) : [];
  } catch {
    return [];
  }
};

const isPhotoItem = (v: unknown): v is PhotoItem =>
  Array.isArray(v) &&
  v.length === 4 &&
  typeof v[0] === "string" &&
  typeof v[1] === "number" &&
  typeof v[2] === "number" &&
  typeof v[3] === "string";

const loadCached = (): CachedPick[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CACHED_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const out: CachedPick[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.source === "string" && typeof o.url === "string" && o.url && isPhotoItem(o.photo)) {
        out.push({ source: o.source, photo: o.photo, url: o.url });
      }
    }
    return out.slice(-MAX_CACHED_TOTAL);
  } catch {
    return [];
  }
};

export const createPhotoRotation = () => ({
  known: null as Set<string> | null,
  seen: new Set<string>(),
  fresh: new Set<string>(),
  recent: null as string[] | null,
  cached: null as CachedPick[] | null,
});

interface Pane {
  box: HTMLElement;
  img: HTMLImageElement;
  pick: Pick;
  url: string;
}

export const photos = (
  el: HTMLElement,
  w: Extract<Widget, { type: "photos" }>,
  ctx: WidgetContext,
  savedRotation?: ReturnType<typeof createPhotoRotation>,
): Cleanup => {
  const slides = [h("div", { class: "ph-slide" }), h("div", { class: "ph-slide" })];
  const label = h("div", { class: "ph-caption" });
  const note = h("div", { class: "w-empty" }, "Loading photos…");
  const root = h("div", { class: "w-photos" }, ...slides, label, note);
  el.append(root);

  let deck: Pick[] = [];
  let queue: Pick[] = [];
  let queueDay = "";
  let wantedSources = new Set<string>(w.sourceIds);
  let fallbackUrls = new Map<string, string>();
  const onScreen = new Set<string>();
  const rotation = savedRotation ?? createPhotoRotation();
  const { seen, fresh } = rotation;
  const recent = (rotation.recent ??= loadRecent(w.id));
  let front = 0;
  let timer: number | undefined;
  let clearTimer: number | undefined;
  let loadTimer: number | undefined;
  let warmTimer: number | undefined;
  let warmAbort: AbortController | null = null;
  let signature = "";
  let failures = 0;
  let stopped = false;
  let pending: HTMLImageElement[] = [];

  const readCached = (): CachedPick[] => {
    const stored = loadCached();
    if (stored.length) {
      rotation.cached = stored;
      return stored;
    }
    return rotation.cached ?? [];
  };

  const writeCached = (next: CachedPick[]) => {
    rotation.cached = next;
    try {
      localStorage.setItem(CACHED_KEY, JSON.stringify(next));
    } catch {
      // Private mode or a full store: rotation.cached still keeps this session's fallback photos.
    }
  };

  const cancelSlides = () => {
    window.clearTimeout(timer);
    window.clearTimeout(clearTimer);
    window.clearTimeout(loadTimer);
    window.clearTimeout(warmTimer);
    warmAbort?.abort();
    warmAbort = null;
    for (const img of [...pending, ...root.querySelectorAll("img")]) {
      img.onload = null;
      img.onerror = null;
      img.src = "";
    }
    pending = [];
  };

  /** Stores up to WARM_TARGET compressed images in Cache Storage without decoding extra bitmaps into RAM. */
  const scheduleWarm = (delayMs = WARM_DELAY_MS) => {
    window.clearTimeout(warmTimer);
    if (stopped || typeof caches === "undefined") return;
    const pool = readCached().filter((c) => wantedSources.has(c.source));
    if (pool.length >= WARM_TARGET || deck.length <= pool.length) return;
    warmTimer = window.setTimeout(() => {
      if (stopped) return;
      const current = readCached();
      if (current.filter((c) => wantedSources.has(c.source)).length >= WARM_TARGET) return;
      const have = new Set(current.map(pickKey));
      const candidates = deck.filter((p) => wantedSources.has(p.source) && !have.has(pickKey(p)));
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      const url = imageUrl("photo", { s: pick.source, i: pick.photo[0], w: String(widthFor(el.clientWidth || 1)) });
      const ctrl = new AbortController();
      warmAbort = ctrl;
      void (async () => {
        try {
          const cache = await caches.open(PHOTO_CACHE);
          const req = new Request(new URL(url, window.location.origin).href);
          let ok = Boolean(await cache.match(req, { ignoreVary: true }));
          if (!ok) {
            const r = await fetch(url, { credentials: "same-origin", signal: ctrl.signal });
            if (r.status === 200 && (r.headers.get("content-type") ?? "").startsWith("image/")) {
              await cache.put(req, r);
              if (typeof cache.keys === "function") {
                const keys = await cache.keys();
                for (let i = 0; i < keys.length - MAX_SW_PHOTOS; i++) {
                  const old = keys[i];
                  if (old) await cache.delete(old);
                }
              }
              ok = true;
            } else {
              await r.body?.cancel().catch(() => undefined);
            }
          }
          if (ok && !stopped) {
            writeCached(rememberCachedPhoto(readCached(), { source: pick.source, photo: pick.photo, url }));
            scheduleWarm(2_000);
          }
        } catch {
          // Offline, aborted, or storage unavailable: normal slide loads still populate the fallback list.
        } finally {
          if (warmAbort === ctrl) warmAbort = null;
        }
      })();
    }, delayMs);
  };

  const today = () => isoDate(new Date(), ctx.timeZone);
  const refill = (newPass = false) => {
    if (newPass) seen.clear();
    queueDay = today();
    queue = order(
      deck.filter((p) => !seen.has(pickKey(p))),
      { today: queueDay, memories: w.memories, fresh, recent },
    );
  };
  const next = (): Pick | undefined => {
    if (queueDay !== today()) refill();
    if (!queue.length && deck.length) refill(true);
    return queue.shift();
  };

  /** One pane of a slide: the photo, and behind it a tiny blurred copy for when it doesn't fill the pane. */
  const pane = (pick: Pick, px: number, exactUrl?: string): Pane => {
    const url =
      exactUrl ?? fallbackUrls.get(pickKey(pick)) ?? imageUrl("photo", { s: pick.source, i: pick.photo[0], w: String(widthFor(px)) });
    const img = h("img", { class: "ph-img", alt: "", decoding: "async" });
    img.src = url;
    return { box: h("div", { class: "ph-pane" }, img), img, pick, url };
  };

  const finish = (box: HTMLElement, img: HTMLImageElement) => {
    const frame = box.clientWidth / Math.max(1, box.clientHeight);
    const fit = fitFor(w.fit, img.naturalWidth / Math.max(1, img.naturalHeight), frame);
    img.classList.add(fit === "cover" ? "ph-fill" : "ph-whole");
    if (fit === "contain") {
      // 32 pixels across, stretched over the pane and blurred: the photo's own colours instead of black bars, for
      // the price of one tiny canvas.
      const soft = h("canvas", { class: "ph-soft" });
      const k = 32 / Math.max(img.naturalWidth, img.naturalHeight);
      soft.width = Math.max(1, Math.round(img.naturalWidth * k));
      soft.height = Math.max(1, Math.round(img.naturalHeight * k));
      soft.getContext("2d")?.drawImage(img, 0, 0, soft.width, soft.height);
      box.prepend(soft);
    }
    if (w.drift) {
      img.classList.add("ph-drift");
      img.style.setProperty("--ph-x", `${Math.round(Math.random() * 6 - 3)}%`);
      img.style.setProperty("--ph-y", `${Math.round(Math.random() * 4 - 2)}%`);
      img.style.animationDuration = `${w.intervalSeconds + FADE_MS / 1000}s`;
    }
  };

  const paint = (ok: Pane[], across: boolean, isFallback: boolean) => {
    failures = 0;
    window.clearTimeout(clearTimer);
    const back = slides[1 - front] as HTMLElement;
    back.className = `ph-slide${ok.length > 1 ? (across ? " ph-pair" : " ph-pair ph-stack") : ""}`;
    fill(back, ...ok.map((p) => p.box));
    for (const p of ok) finish(p.box, p.img);
    back.classList.add("on");
    const old = slides[front] as HTMLElement;
    old.classList.remove("on");
    front = 1 - front;
    onScreen.clear();
    for (const p of ok) onScreen.add(pickKey(p.pick));
    // The old slide's pictures are let go once it has faded, so only one slide's worth stays decoded.
    clearTimer = window.setTimeout(() => {
      for (const img of old.querySelectorAll("img")) img.src = "";
      old.replaceChildren();
    }, FADE_MS + 100);
    const lead = ok[0]?.pick as Pick;
    const key = pickKey(lead);
    const text = w.showCaption
      ? caption(lead.photo[3], queueDay || today(), { memories: w.memories, fresh: !isFallback && fresh.has(key) })
      : "";
    if (!isFallback) {
      for (const p of ok) {
        const k = pickKey(p.pick);
        fresh.delete(k);
        const at = recent.indexOf(k);
        if (at >= 0) recent.splice(at, 1);
        recent.push(k);
      }
      if (recent.length > RECENT) recent.splice(0, recent.length - RECENT);
      try {
        localStorage.setItem(recentKey(w.id), JSON.stringify(recent));
      } catch {
        // Private mode or a full store: the order is still random, it just can't remember across a reload.
      }
      scheduleWarm();
    }
    label.textContent = text;
    label.classList.toggle("on", Boolean(text));
    note.remove();
    timer = window.setTimeout(show, w.intervalSeconds * 1000);
  };

  const show = () => {
    window.clearTimeout(timer);
    window.clearTimeout(loadTimer);
    if (stopped) return;
    const first = next();
    if (!first) return;
    const width = el.clientWidth || 1;
    const height = el.clientHeight || 1;
    const frame = orientation(width, height);
    const picks = [first];
    if (w.pairPortraits && pairs(frame, orientation(first.photo[1], first.photo[2]))) {
      // The saver can pair portraits even when they're sparse in a large album.
      const i = partnerIndex(queue, frame, savedRotation ? queue.length : undefined);
      const partner = i >= 0 ? queue.splice(i, 1)[0] : undefined;
      if (partner) picks.push(partner);
    }
    const across = frame === "landscape" && picks.length > 1;
    const panes = picks.map((p) => pane(p, across ? width / 2 : width));
    pending = panes.map((p) => p.img);
    const slideQueue = queue;
    let waiting = panes.length;

    const tryCachedFallback = () => {
      if (stopped) return;
      const pool = readCached().filter((c) => wantedSources.has(c.source));
      if (
        pool.length === 1 &&
        pool[0] &&
        onScreen.size === 1 &&
        onScreen.has(pickKey(pool[0])) &&
        (slides[front] as HTMLElement).childElementCount > 0
      ) {
        timer = window.setTimeout(show, Math.min(w.intervalSeconds * 1000, 15_000));
        return;
      }
      const chosen = pickCachedPhoto(pool, wantedSources, onScreen);
      if (chosen) {
        const fb = pane({ source: chosen.source, photo: chosen.photo }, width, chosen.url);
        pending = [fb.img];
        const dropAndRetry = () => {
          window.clearTimeout(loadTimer);
          if (stopped) return;
          fb.img.onload = fb.img.onerror = null;
          fb.img.src = "";
          pending = [];
          writeCached(readCached().filter((c) => pickKey(c) !== pickKey(chosen)));
          tryCachedFallback();
        };
        loadTimer = window.setTimeout(dropAndRetry, LOAD_TIMEOUT_MS);
        fb.img.onload = () => {
          window.clearTimeout(loadTimer);
          if (stopped) return;
          pending = [];
          if (!fb.img.naturalWidth) {
            dropAndRetry();
            return;
          }
          paint([fb], false, true);
        };
        fb.img.onerror = dropAndRetry;
        return;
      }
      if (++failures < Math.min(3, deck.length) && queue.length) {
        timer = window.setTimeout(show, 0);
        return;
      }
      if (!(slides[front] as HTMLElement).childElementCount) {
        // Every photo tried so far failed and none are cached yet: say so rather than "Loading photos…" forever.
        note.textContent = "These photos didn't load. Check the album under Settings › Photos.";
        if (!root.contains(note)) root.append(note);
      }
      timer = window.setTimeout(show, Math.min(w.intervalSeconds * 1000, 15_000));
    };

    const done = () => {
      if (stopped || --waiting > 0) return;
      window.clearTimeout(loadTimer);
      pending = [];
      // Every frame keeps to one pass: a feed change or midnight reshuffles only what this pass hasn't shown.
      for (const p of picks) seen.add(pickKey(p));
      if (queue !== slideQueue) refill();
      const ok = panes.filter((p) => p.img.naturalWidth > 0);
      if (ok.length) {
        let cached = readCached();
        for (const p of ok) cached = rememberCachedPhoto(cached, { source: p.pick.source, photo: p.pick.photo, url: p.url });
        writeCached(cached);
        paint(ok, across, false);
        return;
      }
      tryCachedFallback();
    };

    loadTimer = window.setTimeout(() => {
      for (const p of panes) {
        if (p.img.complete) continue;
        p.img.onload = p.img.onerror = null;
        p.img.src = "";
        done();
      }
    }, LOAD_TIMEOUT_MS);
    for (const p of panes) p.img.onload = p.img.onerror = done;
  };

  const stop = subscribe<PhotoData>("photos", FEED_MS, (d) => {
    const wanted = w.sourceIds.length ? w.sourceIds : Object.keys(d.sources);
    wantedSources = new Set(wanted);
    // Prune cached photos from removed albums or albums that cleanly listed without them; keep cached photos when an
    // upstream source (such as Amazon 503) failed to list so the frame never goes blank during an outage.
    const liveBySource = new Map<string, Set<string>>();
    for (const [id, src] of Object.entries(d.sources)) {
      if (!src.error) liveBySource.set(id, new Set(src.photos.map((p) => p[0])));
    }
    const currentCached = readCached();
    const prunedCached = currentCached.filter((c) => {
      if (!(c.source in d.sources)) return false;
      const live = liveBySource.get(c.source);
      return !live || live.has(c.photo[0]);
    });
    if (prunedCached.length !== currentCached.length) writeCached(prunedCached);

    const list = wanted.flatMap((s) => (d.sources[s]?.photos ?? []).map((photo) => ({ source: s, photo })));
    const unique = new Map(list.map((pick) => [pickKey(pick), pick]));
    fallbackUrls = new Map();
    if (!unique.size && wanted.some((s) => Boolean(d.sources[s]?.error))) {
      for (const c of prunedCached) {
        if (!wantedSources.has(c.source)) continue;
        const pick: Pick = { source: c.source, photo: c.photo };
        unique.set(pickKey(pick), pick);
        fallbackUrls.set(pickKey(pick), c.url);
      }
    }
    const emptyText = unique.size
      ? null
      : (wanted.map((s) => d.sources[s]?.error).find(Boolean) ??
        (wanted.length ? "No photos in these albums yet" : "Add a photo album under Settings › Photos."));
    const sig = JSON.stringify(emptyText ?? [...unique.keys()]);
    if (sig === signature) return;
    signature = sig;
    deck = [...unique.values()];
    // Photos that weren't there when the frame last looked (a parent just added them) come up next, once.
    const keys = new Set(unique.keys());
    if (rotation.known && !fallbackUrls.size) {
      for (const k of keys) if (!rotation.known.has(k) && !seen.has(k)) fresh.add(k);
    }
    for (const k of fresh) if (!keys.has(k)) fresh.delete(k);
    if (!fallbackUrls.size) rotation.known = keys;
    refill();
    if (emptyText !== null) {
      cancelSlides();
      onScreen.clear();
      for (const slide of slides) {
        slide.className = "ph-slide";
        slide.replaceChildren();
      }
      label.textContent = "";
      label.classList.remove("on");
      failures = 0;
      fill(root, h("div", { class: "w-empty" }, emptyText));
      return;
    }
    if (!root.contains(slides[0] as Node)) fill(root, ...slides, label);
    // A new photo shows at once; otherwise the slideshow carries on from a fresh order at its next turn.
    if (!pending.length && (fresh.size || !(slides[front] as HTMLElement).childElementCount)) show();
  });

  return () => {
    stopped = true;
    stop();
    cancelSlides();
  };
};
