// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload, DriveBcData } from "@/lib/display/types";

import { drivebc } from "./drivebc";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };

/** An Image that never loads by itself: the test says when each picture arrives. */
const made: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    made.push(this);
  }
}
const stops: (() => void)[] = [];
const camerasOf = (src: string) => new URL(src, "http://x").searchParams.get("c");

afterEach(() => {
  stops.splice(0).forEach((s) => s());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  made.length = 0;
  document.documentElement.classList.remove("saving");
  document.body.replaceChildren();
});

function mount(over: Partial<ReturnType<typeof newWidget<"drivebc">>>, feed: Partial<DriveBcData> = {}) {
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: Date.now(), cameras: [], down: false, ...feed })));
  const el = document.createElement("div");
  document.body.append(el);
  const w = {
    ...newWidget("drivebc", "dbc", { x: 0, y: 0 }),
    cameras: [
      { id: "292", name: "Port Mann Bridge - W" },
      { id: "685", name: "Coquihalla Summit - N" },
    ],
    ...over,
  };
  const stop = drivebc(el, w, ctx);
  stops.push(stop);
  return { el, stop };
}

describe("DriveBC highway cameras", () => {
  it("asks for cameras when none are picked", () => {
    const { el } = mount({ cameras: [] });
    expect(el.textContent).toBe("Pick highway cameras in this widget's settings.");
  });

  it("swaps each picture in once it arrives and refreshes on the widget's timer", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T23:45:00Z") });
    const { el, stop } = mount(
      { refreshSeconds: 120 },
      {
        cameras: [
          { id: "292", name: "Port Mann Bridge - W", caption: "", updated: Date.parse("2026-11-25T23:40:00Z"), state: "ok" },
          { id: "685", name: "Coquihalla Summit - N", caption: "", updated: Date.parse("2026-11-25T23:10:00Z"), state: "late" },
        ],
      },
    );
    expect(made.map((i) => camerasOf(i.src))).toEqual(["292", "685"]);
    expect(el.querySelector<HTMLImageElement>(".dbc-img")!.getAttribute("src")).toBeNull();
    made[0]!.onload!();
    expect(el.querySelector<HTMLImageElement>(".dbc-img")!.getAttribute("src")).toBe(made[0]!.src);
    await vi.advanceTimersByTimeAsync(0);
    const notes = [...el.querySelectorAll(".dbc-note")].map((n) => n.textContent);
    expect(notes).toEqual(["4:40 p.m.", "Delayed · 4:10 p.m."]);
    expect(el.querySelectorAll(".dbc-cam.late")).toHaveLength(1);
    expect([...el.querySelectorAll(".dbc-name")].map((n) => n.textContent)).toEqual(["Port Mann Bridge - W", "Coquihalla Summit - N"]);
    expect(el.querySelector(".dbc-credit")?.textContent).toContain("DriveBC");

    made[1]!.onload!();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(made).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(made.map((i) => camerasOf(i.src))).toEqual(["292", "685", "292", "685"]);
    stop();
  });

  it("fetches nothing under the screen saver, and catches up on waking", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T23:45:00Z") });
    const { stop } = mount({ refreshSeconds: 60, cameras: [{ id: "292", name: "Port Mann" }] });
    made[0]!.onload!();
    document.documentElement.classList.add("saving");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(made).toHaveLength(1);
    document.documentElement.classList.remove("saving");
    await vi.advanceTimersByTimeAsync(0);
    expect(made).toHaveLength(2);
    stop();
  });

  it("shows one camera at a time in turn, loading only the one on screen", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T23:45:00Z") });
    const { el, stop } = mount({ layout: "cycle", cycleSeconds: 10 });
    expect(el.querySelector(".dbc-grid")?.className).toBe("dbc-grid dbc-n1");
    expect(made.map((i) => camerasOf(i.src))).toEqual(["292"]);
    made[0]!.onload!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(made.map((i) => camerasOf(i.src))).toEqual(["292", "685"]);
    expect([...el.querySelectorAll(".dbc-cam")].map((c) => c.classList.contains("on"))).toEqual([false, true]);
    stop();
  });

  it("says a picture is unavailable when the first one fails", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T23:45:00Z") });
    const { el, stop } = mount({ cameras: [{ id: "292", name: "Port Mann" }] });
    made[0]!.onerror!();
    expect(el.querySelector(".dbc-note")?.textContent).toBe("Picture unavailable");
    stop();
  });
});
