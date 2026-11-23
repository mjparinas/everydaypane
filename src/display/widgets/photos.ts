import type { PhotoData, PhotoItem } from "@/lib/display/types";

import { imageUrl, subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// The photo frame: a shuffled slideshow from the chosen sources (all of them when none is chosen). Two stacked images
// cross-fade with opacity only (cheap on a low-power screen), and the next photo is loaded before it is shown, at the
// width this cell actually draws, so the server proxy sends no more pixels than needed.

type Pick = { source: string; photo: PhotoItem };

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Widths are rounded up to a few steps so the browser and proxy caches get hits. */
const STEPS = [480, 800, 1280, 1920, 2560];
const widthFor = (el: HTMLElement) => {
  const want = el.clientWidth * (window.devicePixelRatio || 1);
  return STEPS.find((s) => s >= want) ?? 2560;
};

export const photos: Mount<"photos"> = (el, w) => {
  const layers = [h("img", { class: "ph-img", alt: "", decoding: "async" }), h("img", { class: "ph-img", alt: "", decoding: "async" })];
  const caption = h("div", { class: "ph-caption" });
  const note = h("div", { class: "w-empty" }, "Loading photos…");
  const root = h("div", { class: `w-photos ph-${w.fit}` }, ...layers, caption, note);
  el.append(root);

  let deck: Pick[] = [];
  let queue: Pick[] = [];
  let front = 0;
  let timer: number | undefined;
  let signature = "";
  let failures = 0;
  let stopped = false;

  const next = (): Pick | undefined => {
    if (!queue.length) queue = shuffle(deck);
    return queue.shift();
  };

  const show = () => {
    window.clearTimeout(timer);
    if (stopped) return;
    const pick = next();
    if (!pick) return;
    const back = layers[1 - front] as HTMLImageElement;
    const [id, , , taken] = pick.photo;
    const done = () => {
      if (stopped) return;
      back.onload = back.onerror = null;
      if (!back.naturalWidth && ++failures >= Math.min(3, deck.length)) {
        // Every photo tried so far failed: say so rather than "Loading photos…" forever.
        note.textContent = "These photos didn't load. Check the album under Settings › Photos.";
        if (!root.contains(note)) root.append(note);
      }
      if (back.naturalWidth) {
        failures = 0;
        back.classList.add("on");
        layers[front]?.classList.remove("on");
        front = 1 - front;
        caption.textContent = w.showCaption && taken ? formatDate(taken) : "";
        note.remove();
      }
      // After a failure, try the next photo soon rather than after a whole interval.
      timer = window.setTimeout(show, back.naturalWidth ? w.intervalSeconds * 1000 : Math.min(w.intervalSeconds * 1000, 15_000));
    };
    back.onload = back.onerror = done;
    back.src = imageUrl("photo", { s: pick.source, i: id, w: String(widthFor(el)) });
  };

  const stop = subscribe<PhotoData>("photos", 30 * 60_000, (d) => {
    const wanted = w.sourceIds.length ? w.sourceIds : Object.keys(d.sources);
    const next = wanted.flatMap((s) => (d.sources[s]?.photos ?? []).map((photo) => ({ source: s, photo })));
    const sig = next.map((p) => p.source + p.photo[0]).join(",");
    if (sig === signature) return;
    signature = sig;
    deck = next;
    queue = [];
    if (!deck.length) {
      const errors = wanted.map((s) => d.sources[s]?.error).filter(Boolean);
      fill(
        root,
        h(
          "div",
          { class: "w-empty" },
          errors[0] ?? (wanted.length ? "No photos in these albums yet" : "Add a photo album in the admin panel."),
        ),
      );
      return;
    }
    if (!root.contains(layers[0] as Node)) fill(root, ...layers, caption);
    show();
  });

  return () => {
    stopped = true;
    stop();
    window.clearTimeout(timer);
    for (const layer of layers) {
      const img = layer as HTMLImageElement;
      img.onload = null;
      img.onerror = null;
      img.src = "";
    }
  };
};

function formatDate(iso: string): string {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(t) : "";
}
