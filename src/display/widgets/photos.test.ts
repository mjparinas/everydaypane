// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import type { DisplayPayload, PhotoData, PhotoItem } from "@/lib/display/types";

import { refresh } from "../api";
import { photos } from "./photos";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows empty and error states and starts the slideshow when photos become available", async () => {
  vi.useFakeTimers();
  const el = document.createElement("div");
  let album: PhotoData["sources"][string] = { photos: [], error: null };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ updatedAt: Date.now(), sources: { album } })),
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (this: HTMLImageElement, src: string) {
    if (src) setTimeout(() => this.dispatchEvent(new Event("load")), 0);
  });
  const advance = async () => {
    refresh("photos");
    await vi.advanceTimersByTimeAsync(100);
  };
  const stop = photos(
    el,
    {
      id: "photos",
      type: "photos",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      showBackground: false,
      sourceIds: ["album"],
      intervalSeconds: 60,
      fit: "cover",
      showCaption: false,
      pairPortraits: false,
      drift: false,
      memories: false,
    },
    { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true },
  );
  try {
    await advance();
    expect(el.textContent).toBe("No photos in these albums yet");

    album = { photos: [], error: "Amazon refused this album" };
    await advance();
    expect(el.textContent).toBe("Amazon refused this album");

    const first: PhotoItem = ["first", 1200, 800, ""];
    album = { photos: [first], error: null };
    await advance();
    expect(el.querySelectorAll(".ph-slide.on img")).toHaveLength(1);

    album = { photos: [], error: null };
    await advance();
    expect(el.textContent).toBe("No photos in these albums yet");

    album = { photos: [first], error: null };
    await advance();
    expect(el.querySelectorAll(".ph-slide.on img")).toHaveLength(1);
  } finally {
    stop();
  }
});
