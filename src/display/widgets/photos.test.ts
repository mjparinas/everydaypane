// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import type { DisplayPayload, PhotoData, PhotoItem } from "@/lib/display/types";

import { refresh } from "../api";
import { photos } from "./photos";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
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

it("falls back immediately to a randomly cached photo when upstream images fail, across reloads and outages", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.99999);
  const broken = new Set(["bad-start", "bad-later", "bad-reload"]);
  let album: PhotoData["sources"][string] = {
    photos: [
      ["bad-start", 1200, 800, ""],
      ["good-a", 1200, 800, ""],
      ["good-b", 1200, 800, ""],
      ["bad-later", 1200, 800, ""],
    ],
    error: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ updatedAt: Date.now(), sources: { album } })),
  );
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (this: HTMLImageElement, src: string) {
    this.setAttribute("src", src);
    if (!src) return;
    const id = new URL(src, window.location.href).searchParams.get("i") ?? "";
    const fail = broken.has(id);
    Object.defineProperties(this, {
      naturalWidth: { configurable: true, value: fail ? 0 : 1200 },
      naturalHeight: { configurable: true, value: fail ? 0 : 800 },
    });
    setTimeout(() => this.dispatchEvent(new Event(fail ? "error" : "load")), 0);
  });

  const widget = {
    id: "photos",
    type: "photos" as const,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    showBackground: false,
    sourceIds: ["album"],
    intervalSeconds: 60,
    fit: "cover" as const,
    showCaption: false,
    pairPortraits: false,
    drift: false,
    memories: false,
  };
  const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
  const shownId = (root: HTMLElement) => {
    const src = root.querySelector<HTMLImageElement>(".ph-slide.on img")?.getAttribute("src") ?? "";
    return src ? new URL(src, window.location.href).searchParams.get("i") : null;
  };

  const firstEl = document.createElement("div");
  const stopFirst = photos(firstEl, widget, ctx);
  try {
    refresh("photos");
    // "bad-start" fails and the frame immediately advances to "good-a" without waiting on a blank screen.
    await vi.advanceTimersByTimeAsync(50);
    expect(shownId(firstEl)).toBe("good-a");
    expect(firstEl.querySelector(".w-empty")).toBeNull();

    // Next slide loads "good-b" and adds it to the small fallback pool.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shownId(firstEl)).toBe("good-b");

    // Next slide hits "bad-later": falls back to cached "good-a" (avoiding "good-b" already on screen).
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shownId(firstEl)).toBe("good-a");
    expect(firstEl.querySelector(".w-empty")).toBeNull();
  } finally {
    stopFirst();
  }

  // Simulate a reload where Amazon's first tried photo fails, then an upstream 503 where the album list itself errors.
  album = {
    photos: [
      ["bad-reload", 1200, 800, ""],
      ["bad-later", 1200, 800, ""],
      ["good-a", 1200, 800, ""],
      ["good-b", 1200, 800, ""],
    ],
    error: null,
  };
  const secondEl = document.createElement("div");
  const stopSecond = photos(secondEl, widget, ctx);
  try {
    refresh("photos");
    await vi.advanceTimersByTimeAsync(50);
    expect(["good-a", "good-b"]).toContain(shownId(secondEl));
    expect(secondEl.querySelector(".w-empty")).toBeNull();

    // If a cached photo was evicted by the browser, it is dropped and another cached photo is shown.
    broken.add("good-b");
    album = { photos: [], error: "Amazon is turning our server away right now (503)." };
    refresh("photos");
    await vi.advanceTimersByTimeAsync(60_100);
    expect(shownId(secondEl)).toBe("good-a");
    expect(secondEl.querySelector(".w-empty")).toBeNull();
  } finally {
    stopSecond();
  }
});
