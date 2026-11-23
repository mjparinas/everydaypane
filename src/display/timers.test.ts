// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload } from "@/lib/display/types";

import { resetAlarms } from "./alarm";
import { pomodoro } from "./widgets/pomodoro";
import { timer } from "./widgets/timer";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };

// Web Audio isn't in jsdom: a stand-in that counts the beeps.
const beeps: number[] = [];
class FakeAudio {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: (g: unknown) => g,
      start: () => beeps.push(osc.frequency.value),
      stop: () => undefined,
    };
    return osc;
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d };
  }
}

function mount<T>(fn: (el: HTMLElement) => T) {
  const app = document.createElement("div");
  app.id = "app";
  const cell = document.createElement("section");
  app.append(cell);
  document.body.append(app);
  return { cell, stop: fn(cell) };
}

const click = (el: Element | null | undefined) => (el as HTMLElement).click();

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-21T01:00:00Z") });
  vi.stubGlobal("AudioContext", FakeAudio);
  beeps.length = 0;
  localStorage.clear();
});

afterEach(() => {
  resetAlarms();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("kitchen timers", () => {
  const w = { ...newWidget("timer", "kitchen", { x: 0, y: 0 }), presets: [{ id: "p", label: "Eggs", emoji: "🥚", seconds: 420 }] };

  it("starts from a tap, counts down, then flashes, beeps and fills the screen until tapped", async () => {
    const { cell, stop } = mount((el) => timer(el, w, ctx));
    click(cell.querySelector(".tm-preset"));
    expect(cell.querySelector(".tm-time")?.textContent).toBe("7:00");
    // The display ticks just after each second.
    await vi.advanceTimersByTimeAsync(60_010);
    expect(cell.querySelector(".tm-time")?.textContent).toBe("6:00");

    await vi.advanceTimersByTimeAsync(6 * 60_000 + 100);
    expect(cell.querySelector(".tm-time")?.textContent).toBe("Done");
    expect(cell.querySelector(".tm")).toHaveClass("tm-ringing");
    expect(document.querySelector(".ring-title")?.textContent).toBe("Eggs is done");
    expect(beeps.length).toBeGreaterThan(0);

    // A tap on the alert stops it and clears the timer.
    click(document.querySelector(".ring"));
    expect(document.querySelector(".ring")).toBeNull();
    expect(cell.querySelector(".tm")).toBeNull();
    const after = beeps.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(beeps.length).toBe(after);
    stop();
  });

  it("names the alarm dialog and dismisses it with Escape", async () => {
    const { cell, stop } = mount((el) => timer(el, w, ctx));
    click(cell.querySelector(".tm-preset"));
    await vi.advanceTimersByTimeAsync(420_100);
    const ring = document.querySelector<HTMLElement>(".ring");
    expect(ring?.getAttribute("role")).toBe("alertdialog");
    expect(ring?.getAttribute("aria-modal")).toBe("true");
    expect(ring?.getAttribute("aria-label")).toBe("Eggs is done. Tap to stop.");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".ring")).toBeNull();
    stop();
  });

  it("stops alerting by itself after the set time and leaves the timer as done", async () => {
    const { cell, stop } = mount((el) => timer(el, { ...w, ringSeconds: 10 }, ctx));
    click(cell.querySelector(".tm-preset"));
    await vi.advanceTimersByTimeAsync(420_000 + 11_000);
    expect(document.querySelector(".ring")).toBeNull();
    expect(cell.querySelector(".tm")).toHaveClass("tm-done");
    expect(cell.querySelector(".tm")).not.toHaveClass("tm-ringing");
    stop();
  });

  it("keeps quiet and in the widget when sound and full screen are off", async () => {
    const { cell, stop } = mount((el) => timer(el, { ...w, sound: false, fullScreen: false }, ctx));
    click(cell.querySelector(".tm-preset"));
    await vi.advanceTimersByTimeAsync(420_100);
    expect(cell.querySelector(".tm")).toHaveClass("tm-ringing");
    expect(document.querySelector(".ring")).toBeNull();
    expect(beeps).toEqual([]);
    stop();
  });

  it("pauses with a tap on the time, and survives the widget being redrawn", async () => {
    const first = mount((el) => timer(el, w, ctx));
    click(first.cell.querySelector(".tm-preset"));
    await vi.advanceTimersByTimeAsync(20_000);
    click(first.cell.querySelector(".tm-main"));
    first.stop();
    document.body.replaceChildren();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const again = mount((el) => timer(el, w, ctx));
    expect(again.cell.querySelector(".tm")).toHaveClass("tm-paused");
    expect(again.cell.querySelector(".tm-time")?.textContent).toBe("6:40");
    expect(document.querySelector(".ring")).toBeNull();
    again.stop();
  });

  it("still rings when the view showing it has been swapped for another", async () => {
    const { cell, stop } = mount((el) => timer(el, w, ctx));
    click(cell.querySelector(".tm-preset"));
    stop();
    document.getElementById("app")!.replaceChildren();
    await vi.advanceTimersByTimeAsync(420_100);
    expect(document.querySelector(".ring-title")?.textContent).toBe("Eggs is done");
  });
});

describe("pomodoro", () => {
  const w = { ...newWidget("pomodoro", "focus", { x: 0, y: 0 }), workMinutes: 1, shortBreakMinutes: 1, rounds: 2 };

  it("runs a focus round, chimes, and waits on the break until Start", async () => {
    const { cell, stop } = mount((el) => pomodoro(el, w, ctx));
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Focus 1 of 2");
    expect(cell.querySelector(".pm-go")?.textContent).toBe("Start");
    click(cell.querySelector(".pm-go"));
    expect(cell.querySelector(".pm-go")?.textContent).toBe("Pause");
    await vi.advanceTimersByTimeAsync(30_010);
    expect(cell.querySelector(".pm-time")?.textContent).toBe("0:30");

    await vi.advanceTimersByTimeAsync(30_100);
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Short break");
    expect(cell.querySelector(".pm-time")?.textContent).toBe("1:00");
    expect(cell.querySelector(".pm-go")?.textContent).toBe("Start");
    expect(cell.querySelector(".w-pomodoro")).toHaveClass("pm-ringing");
    expect(beeps).toContain(660);
    // The full-screen notice is off by default for the pomodoro.
    expect(document.querySelector(".ring")).toBeNull();
    stop();
  });

  it("moves on by itself with auto-start, and skips and resets", async () => {
    const { cell, stop } = mount((el) => pomodoro(el, { ...w, autoStart: true }, ctx));
    click(cell.querySelector(".pm-go"));
    await vi.advanceTimersByTimeAsync(60_100);
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Short break");
    expect(cell.querySelector(".pm-go")?.textContent).toBe("Pause");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Focus 2 of 2");
    click(cell.querySelectorAll(".pm-btn")[1]);
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Long break");
    click(cell.querySelectorAll(".pm-btn")[2]);
    expect(cell.querySelector(".pm-phase")?.textContent).toBe("Focus 1 of 2");
    expect(cell.querySelector(".pm-go")?.textContent).toBe("Start");
    stop();
  });
});
