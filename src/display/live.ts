// Live camera video (Melvin, 2026-11-21: "can I add RTSP or other video feeds"). Browsers can't play a camera's RTSP,
// and our server on Vercel can't reach the home network (nor should it carry hours of video), so a go2rtc server at
// home turns the camera's stream into one a browser plays, and the screen, which is on the same network, plays it
// directly. No player library: a plain <video> for go2rtc's fragmented MP4 (the camera's own H.264, decoded by the
// screen's hardware), or an <img> for its MJPEG.
//
// Video is the heaviest thing a screen can do, so it only plays while someone could see it: not while the page is
// hidden, not while the widget is off screen, and not while the night schedule has the screen nearly black.

export type LiveFormat = "mp4" | "mjpeg";
export type LiveStatus = "connecting" | "live" | "offline";

/** go2rtc's address for a stream: `<base>/api/stream.mp4?src=<name>` (or stream.mjpeg). */
export function liveUrl(base: string, stream: string, format: LiveFormat): string {
  return `${base.replace(/\/+$/, "")}/api/stream.${format}?src=${encodeURIComponent(stream)}`;
}

// ---- Whether the screen is worth playing to: the page is visible and not dimmed nearly to black. ----

/** Dim levels from here up count as "screen off" for video (the schedule's dim goes 0 to 0.9). */
export const DEEP_DIM = 0.8;
let deepDim = false;
const watchers = new Set<() => void>();

/** Called by main.ts whenever the schedule's dim level is applied. */
export function setDimLevel(level: number): void {
  const next = level >= DEEP_DIM;
  if (next === deepDim) return;
  deepDim = next;
  for (const w of watchers) w();
}

const screenAwake = () => !document.hidden && !deepDim;

/** Retry delay after a failure: 5 s, 10 s, 20 s, then once a minute. */
export function retryDelay(failures: number): number {
  return Math.min(60_000, 5000 * 2 ** Math.max(0, failures - 1));
}

/** How far behind live a video may fall before it skips ahead (a slow network or a busy screen adds up). */
export const MAX_LAG_S = 4;
const WATCH_MS = 10_000;

/**
 * Plays a go2rtc stream in `media` while the screen is awake and `media` is on screen, reconnecting after a failure
 * or a frozen picture. Returns the cleanup, which closes the connection.
 */
export function playLive(media: HTMLVideoElement | HTMLImageElement, url: string, onStatus: (s: LiveStatus) => void): () => void {
  const isVideo = media instanceof HTMLVideoElement;
  let stopped = false;
  let running = false;
  let onScreen = true;
  let failures = 0;
  let retryTimer: number | undefined;
  let watchTimer: number | undefined;
  let lastTime = -1;

  if (isVideo) {
    // Autoplay needs muted; inline so phones don't go full screen.
    media.muted = true;
    media.playsInline = true;
    media.disablePictureInPicture = true;
    media.preload = "none";
  }

  const connect = () => {
    running = true;
    lastTime = -1;
    onStatus("connecting");
    media.src = url;
    if (isVideo) {
      media.play().catch(() => undefined);
      window.clearInterval(watchTimer);
      watchTimer = window.setInterval(watch, WATCH_MS);
    }
  };
  // Removing the source (and, for video, loading nothing) closes the connection to go2rtc.
  const disconnect = () => {
    running = false;
    window.clearTimeout(retryTimer);
    window.clearInterval(watchTimer);
    retryTimer = undefined;
    media.removeAttribute("src");
    if (isVideo) media.load();
  };
  const fail = () => {
    if (stopped || !running) return;
    disconnect();
    failures++;
    onStatus("offline");
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      update();
    }, retryDelay(failures));
  };
  // A video whose clock stopped is frozen (go2rtc lost the camera, or the network dropped without an error): start
  // again. One that fell behind skips to the newest picture.
  const watch = () => {
    if (!isVideo || !running) return;
    const t = media.currentTime;
    if (t === lastTime) return fail();
    lastTime = t;
    const end = media.buffered.length ? media.buffered.end(media.buffered.length - 1) : t;
    if (end - t > MAX_LAG_S) {
      media.currentTime = end - 0.5;
      lastTime = media.currentTime;
    }
  };
  const update = () => {
    if (stopped) return;
    const want = screenAwake() && onScreen;
    if (want && !running && retryTimer === undefined) connect();
    else if (!want && running) disconnect();
    else if (!want) {
      // Waiting to retry, but nobody is watching: retry when someone is.
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const ok = () => {
    failures = 0;
    onStatus("live");
  };
  media.addEventListener(isVideo ? "playing" : "load", ok);
  media.addEventListener("error", fail);
  if (isVideo) media.addEventListener("ended", fail);

  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (!e) return;
          onScreen = e.isIntersecting;
          update();
        })
      : null;
  observer?.observe(media);
  document.addEventListener("visibilitychange", update);
  watchers.add(update);
  update();

  return () => {
    stopped = true;
    disconnect();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", update);
    watchers.delete(update);
    media.removeEventListener(isVideo ? "playing" : "load", ok);
    media.removeEventListener("error", fail);
    media.removeEventListener("ended", fail);
  };
}
