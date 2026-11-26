import { h, underSaver } from "../dom";

/** Tear down iframes under the screen saver or when the tab is hidden (Melvin, 2026-11-23: same pattern as earth). */
export function mountIframe(
  root: HTMLElement,
  title: string,
  src: () => string,
  opts: { reloadMs?: number; sandbox?: string; className?: string } = {},
): () => void {
  const wrap = h("div", { class: opts.className ?? "w-embed" });
  root.append(wrap);
  let frame: HTMLIFrameElement | null = null;
  let madeAt = 0;
  const reloadMs = opts.reloadMs ?? 0;
  const sandbox = opts.sandbox ?? "allow-scripts allow-same-origin allow-popups";

  const shouldShow = () => !document.hidden && !underSaver(wrap);

  const make = () => {
    frame?.remove();
    frame = h("iframe", {
      class: "embed-frame",
      title,
      src: src(),
      referrerpolicy: "no-referrer",
      sandbox,
      tabindex: "-1",
    });
    wrap.append(frame);
    madeAt = Date.now();
  };

  const sync = () => {
    if (!shouldShow()) {
      frame?.remove();
      frame = null;
    } else if (!frame || (reloadMs > 0 && Date.now() - madeAt >= reloadMs)) make();
  };

  const first = window.requestAnimationFrame(sync);
  const watch = new MutationObserver(sync);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", sync);
  const timer = reloadMs > 0 ? window.setInterval(sync, 60_000) : undefined;

  return () => {
    window.cancelAnimationFrame(first);
    watch.disconnect();
    document.removeEventListener("visibilitychange", sync);
    if (timer !== undefined) window.clearInterval(timer);
    frame?.remove();
  };
}
