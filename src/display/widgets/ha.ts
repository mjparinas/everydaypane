import { imageUrl } from "../api";
import { h, setText } from "../dom";
import type { Mount } from "./types";

// UniFi Protect cameras, and the Home Assistant feed's polling interval shared by every tile, music widget and the
// doorbell. The Smart device tile itself lives in haEntity.ts and loads only on screens that show one.

export const HA_EVERY = 5000;
/**
 * Keeps an image showing a camera's latest picture. Each frame is loaded off screen and swapped in when it arrives,
 * so the picture never flashes blank; a hidden page fetches nothing.
 */
export function cameraLoop(img: HTMLImageElement, entityId: string, everyMs: number, onError: (failed: boolean) => void): () => void {
  let timer: number | undefined;
  let stopped = false;
  let n = 0;
  const tick = () => {
    if (stopped) return;
    if (document.hidden) {
      timer = window.setTimeout(tick, everyMs);
      return;
    }
    const next = new Image();
    next.onload = () => {
      if (stopped) return;
      img.src = next.src;
      onError(false);
      timer = window.setTimeout(tick, everyMs);
    };
    next.onerror = () => {
      if (stopped) return;
      onError(true);
      timer = window.setTimeout(tick, Math.max(everyMs, 10_000));
    };
    next.src = imageUrl("camera", { e: entityId, n: String(n++) });
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

export const camera: Mount<"camera"> = (el, w) => {
  if (!w.entityId) {
    el.append(h("div", { class: "w-empty" }, "Pick a camera for this widget."));
    return () => undefined;
  }
  const img = h("img", { class: "cam-img", alt: w.title || "Camera", draggable: "false" });
  const status = h("div", { class: "cam-status" });
  const label = w.title ? h("div", { class: "cam-label" }, w.title) : null;
  el.append(h("div", { class: "w-camera" }, img, label, status));
  return cameraLoop(img, w.entityId, w.refreshSeconds * 1000, (failed) => setText(status, failed ? "Camera offline" : ""));
};
