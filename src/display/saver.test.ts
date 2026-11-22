// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DisplayPayload } from "@/lib/display/types";
import { SCREEN_SAVER_OFF } from "@/lib/screenSaver";
import { zonedFormatter } from "@/lib/timeZone";

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
  document.body.replaceChildren();
  document.documentElement.className = "";
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
    expect(app.querySelector(".sv-time")?.textContent).toBe(want.format(Date.now()));
    vi.unstubAllGlobals();
  });
});
