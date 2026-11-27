// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DisplayPayload, PhotoItem } from "@/lib/display/types";
import { SCREEN_SAVER_OFF } from "@/lib/screenSaver";
import { zonedFormatter } from "@/lib/timeZone";

import { wallAmPm } from "./format";
import { screenSaver } from "./saver";

const MIN = 60_000;

function payload(s: Partial<DisplayPayload["screenSaver"]>): DisplayPayload {
  return {
    location: { name: "Langley", timeZone: "America/Vancouver" },
    hour12: true,
    screenSaver: { ...SCREEN_SAVER_OFF, ...s },
  } as DisplayPayload;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.className = "";
  localStorage.clear();
});

describe("the display's screen saver", () => {
  it("goes dark after the idle minutes, and a tap on it wakes the dashboard without reaching a widget", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") }); // midday in Langley
    const app = document.createElement("div");
    const widget = document.createElement("button");
    app.append(widget);
    document.body.append(app);
    const pressed = vi.fn();
    widget.addEventListener("click", pressed);

    const p = payload({ idle: true, shows: "dark", minutes: 1 });
    const s = screenSaver(app, () => p);
    s.update();
    expect(s.mode).toBe("off");

    vi.advanceTimersByTime(MIN + 15_000);
    expect(s.mode).toBe("dark");
    expect(document.documentElement.classList.contains("saving")).toBe(true);
    const el = app.querySelector(".saver.show") as HTMLElement;
    expect(el).not.toBeNull();

    el.click();
    expect(s.mode).toBe("off");
    expect(pressed).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("saving")).toBe(false);
  });

  it("a touch on the dashboard keeps it awake", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    const app = document.createElement("div");
    document.body.append(app);
    const p = payload({ idle: true, shows: "dark", minutes: 1 });
    const s = screenSaver(app, () => p);
    s.update();
    vi.advanceTimersByTime(45_000);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.advanceTimersByTime(45_000);
    expect(s.mode).toBe("off");
    vi.advanceTimersByTime(30_000);
    expect(s.mode).toBe("dark");
  });

  it("is dark during the night window from the start, and a doorbell or alert wake brings the dashboard back", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T10:30:00Z") }); // the small hours in Langley
    const app = document.createElement("div");
    document.body.append(app);
    const p = payload({ night: true, nightStart: "23:00", nightEnd: "06:00", minutes: 5 });
    const s = screenSaver(app, () => p);
    s.update();
    expect(s.mode).toBe("dark");
    s.wake();
    expect(s.mode).toBe("off");
    vi.advanceTimersByTime(5 * MIN + 15_000);
    expect(s.mode).toBe("dark");
  });

  it("pairs distant portraits on a landscape screen and resumes with unseen photos after waking", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    vi.spyOn(Math, "random").mockReturnValue(0.99999);
    const portraits: PhotoItem[] = [
      ["vertical-a", 800, 1200, ""],
      ["vertical-b", 800, 1200, ""],
    ];
    const landscapes = Array.from({ length: 15 }, (_, i): PhotoItem => [`horizontal-${i}`, 1200, 800, ""]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ sources: { album: { photos: [portraits[0], ...landscapes, portraits[1]] } } }))),
    );
    const loaded: string[] = [];
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (this: HTMLImageElement, src: string) {
      if (!src) return;
      const id = new URL(src, window.location.href).searchParams.get("i") ?? "";
      const portrait = id.startsWith("vertical");
      Object.defineProperties(this, {
        naturalWidth: { value: portrait ? 800 : 1200 },
        naturalHeight: { value: portrait ? 1200 : 800 },
      });
      setTimeout(() => {
        loaded.push(id);
        this.dispatchEvent(new Event("load"));
      }, 0);
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const app = document.createElement("div");
    document.body.append(app);
    const p = payload({ idle: true, shows: "photos", minutes: 1, photoSeconds: 60 });
    const s = screenSaver(app, () => p);
    s.update();
    await vi.advanceTimersByTimeAsync(MIN + 500);
    expect(loaded).toEqual(["vertical-a", "vertical-b"]);
    expect(app.querySelectorAll(".saver .ph-pair.on img")).toHaveLength(2);

    s.wake();
    await vi.advanceTimersByTimeAsync(MIN + 15_000);
    expect(loaded).toEqual(["vertical-a", "vertical-b", "horizontal-0"]);
    s.wake();
  });

  it("doesn't open on the same photo after the screen reloads", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    // No shuffle at all: without the screen remembering, every load would open on "one".
    vi.spyOn(Math, "random").mockReturnValue(0.99999);
    const album: PhotoItem[] = ["one", "two", "three", "four"].map((id): PhotoItem => [id, 1200, 800, ""]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ sources: { album: { photos: album } } }))),
    );
    const loaded: string[] = [];
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (this: HTMLImageElement, src: string) {
      if (!src) return;
      Object.defineProperties(this, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
      setTimeout(() => {
        loaded.push(new URL(src, window.location.href).searchParams.get("i") ?? "");
        this.dispatchEvent(new Event("load"));
      }, 0);
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1080);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const p = payload({ idle: true, shows: "photos", minutes: 1, photoSeconds: 60 });

    const first = document.createElement("div");
    document.body.append(first);
    const a = screenSaver(first, () => p);
    a.update();
    await vi.advanceTimersByTimeAsync(MIN + 500);
    expect(loaded).toEqual(["one"]);
    a.wake();
    first.remove();

    // A reload: a new page, a new saver, only localStorage carried over.
    const second = document.createElement("div");
    document.body.append(second);
    const b = screenSaver(second, () => p);
    b.update();
    await vi.advanceTimersByTimeAsync(MIN + 500);
    expect(loaded).toEqual(["one", "two"]);
    b.wake();
  });

  it("shows a clock over the photos when asked", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const app = document.createElement("div");
    document.body.append(app);
    const p = payload({ idle: true, shows: "photos", minutes: 1, showClock: true });
    const s = screenSaver(app, () => p);
    s.update();
    vi.advanceTimersByTime(MIN + 15_000);
    expect(s.mode).toBe("photos");
    expect(app.querySelector(".saver .w-photos")).not.toBeNull();
    const want = zonedFormatter("America/Vancouver", { hour: "numeric", minute: "2-digit", hour12: true });
    expect(app.querySelector(".sv-time")?.textContent).toBe(wallAmPm(want.format(Date.now())));
    vi.unstubAllGlobals();
  });

  it("draws the idle view after the idle minutes, and a tap goes back without reaching the idle view's widgets", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    const app = document.createElement("div");
    document.body.append(app);
    const pressed = vi.fn();
    const taken = vi.fn();
    const mount = vi.fn((into: HTMLElement, viewId: string) => {
      const button = document.createElement("button");
      button.className = "idle-widget";
      button.dataset.view = viewId;
      button.addEventListener("click", pressed);
      into.append(button);
      return taken;
    });
    const p = payload({ idle: true, shows: "view", viewId: "frame", minutes: 1 });
    const s = screenSaver(app, () => p, undefined, mount);
    s.update();
    expect(mount).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MIN + 15_000);
    expect(s.mode).toBe("view");
    expect(mount).toHaveBeenCalledWith(expect.any(HTMLElement), "frame");
    expect(app.querySelector<HTMLElement>(".saver .idle-widget")?.dataset.view).toBe("frame");

    // In the browser .idle-stage has no pointer events, so a tap lands on the saver itself.
    (app.querySelector(".saver.show") as HTMLElement).click();
    expect(s.mode).toBe("off");
    expect(taken).toHaveBeenCalledOnce();
    expect(pressed).not.toHaveBeenCalled();
    expect(app.querySelector(".idle-widget")).toBeNull();
  });

  it("falls back to photos when the idle view is gone", () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z") });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const app = document.createElement("div");
    document.body.append(app);
    const p = payload({ idle: true, shows: "view", viewId: "deleted", minutes: 1, showClock: false });
    const s = screenSaver(
      app,
      () => p,
      undefined,
      () => null,
    );
    s.update();
    vi.advanceTimersByTime(MIN + 15_000);
    expect(s.mode).toBe("view");
    expect(app.querySelector(".saver.saver-photos .w-photos")).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("the night window still goes dark instead of the idle view", () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T08:00:00Z") }); // midnight in Langley
    const app = document.createElement("div");
    document.body.append(app);
    const mount = vi.fn(() => () => undefined);
    const p = payload({ idle: true, shows: "view", viewId: "frame", night: true, nightStart: "23:00", nightEnd: "06:00", minutes: 1 });
    const s = screenSaver(app, () => p, undefined, mount);
    s.update();
    expect(s.mode).toBe("dark");
    expect(mount).not.toHaveBeenCalled();
  });
});
