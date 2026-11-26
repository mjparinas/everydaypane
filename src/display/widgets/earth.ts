import { earthUrl } from "@/lib/earth";

import { h, underSaver } from "../dom";
import type { Mount } from "./types";

// The earth wind map (Melvin, 2026-11-21): earth.nullschool.net in a frame, centred where the widget says. Earth
// animates thousands of wind lines on the GPU, the heaviest thing a wall screen can run, so the frame exists only while
// it can be seen: it is removed while the screen saver is up or the page is hidden, and made again on waking. It is
// also made again every hour, because earth reads the latest weather only when it loads (its data is new every few
// hours; a load is about 600 KB). Touches never reach it (`pointer-events: none`): a tap there would turn the globe
// or open earth's menu, and the screen saver would never hear it.

export const RELOAD_MS = 60 * 60_000;

export const earth: Mount<"earth"> = (el, w) => {
  const root = h("div", { class: "w-earth" });
  el.append(root);
  let frame: HTMLIFrameElement | null = null;
  let madeAt = 0;

  const shouldShow = () => !document.hidden && !underSaver(root);

  const make = () => {
    frame?.remove();
    const width = root.clientWidth || el.clientWidth;
    const height = root.clientHeight || el.clientHeight;
    frame = h("iframe", {
      class: "ea-frame",
      title: "Earth wind map",
      src: earthUrl(w, width, height),
      referrerpolicy: "no-referrer",
      // Scripts and its own storage only: no pop-ups, and it can never move the dashboard away.
      sandbox: "allow-scripts allow-same-origin",
      tabindex: "-1",
    });
    root.append(frame);
    madeAt = Date.now();
  };

  const sync = () => {
    if (!shouldShow()) {
      frame?.remove();
      frame = null;
    } else if (!frame || Date.now() - madeAt >= RELOAD_MS) make();
  };

  // Laid out first, so the zoom is worked out from the cell's real size.
  const first = window.requestAnimationFrame(sync);
  const watch = new MutationObserver(sync);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", sync);
  const timer = window.setInterval(sync, 60_000);

  return () => {
    window.cancelAnimationFrame(first);
    watch.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.clearInterval(timer);
    frame?.remove();
  };
};
