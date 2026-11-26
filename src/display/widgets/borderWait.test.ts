// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { BorderData, DisplayPayload } from "@/lib/display/types";

import { borderWait, fastest, waitText } from "./borderWait";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const at = Date.parse("2026-11-25T23:00:00Z"); // 4 PM in Langley

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("border wait widget", () => {
  it("writes waits plainly", () => {
    expect(waitText(null)).toBe("—");
    expect(waitText({ minutes: null, closed: false, at })).toBe("—");
    expect(waitText({ minutes: null, closed: true, at })).toBe("Closed");
    expect(waitText({ minutes: 0, closed: false, at })).toBe("No Wait");
    expect(waitText({ minutes: 25, closed: false, at })).toBe("25 min");
    expect(waitText({ minutes: 60, closed: false, at })).toBe("1 h");
    expect(waitText({ minutes: 75, closed: false, at })).toBe("1 h 15 min");
  });

  it("marks the one shortest known wait, never a tie or a lone reading", () => {
    const w = (minutes: number | null, closed = false) => ({ minutes, closed, at });
    expect(fastest([w(30), w(10), w(20)])).toBe(1);
    expect(fastest([w(30), w(0, true), w(null)])).toBe(-1);
    expect(fastest([w(10), w(10)])).toBe(-1);
    expect(fastest([null, w(5), w(15)])).toBe(1);
  });

  it("draws a row per crossing in the widget's order, colours waits, and greys out old readings", async () => {
    vi.useFakeTimers({ now: at + 30 * 60_000 });
    const data: BorderData = {
      updatedAt: Date.now(),
      down: { cbsa: false, cbp: false },
      crossings: [
        {
          id: "aldergrove",
          name: "Aldergrove",
          toUS: { minutes: 10, closed: false, at },
          toCanada: { minutes: 0, closed: false, at: at - 3 * 3_600_000 },
        },
        {
          id: "peaceArch",
          name: "Peace Arch",
          toUS: { minutes: 50, nexus: 5, closed: false, at },
          toCanada: { minutes: 20, closed: false, at },
        },
      ],
    };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const w = {
      ...newWidget("borderWait", "bw", { x: 0, y: 0 }),
      crossings: ["peaceArch" as const, "aldergrove" as const],
      showNexus: true,
    };
    const stop = borderWait(el, w, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const rows = [...el.querySelectorAll(".bw-row:not(.bw-head)")];
    expect(rows.map((r) => r.querySelector(".bw-name")?.textContent)).toEqual(["Peace Arch", "Aldergrove"]);
    expect(rows[0]!.textContent).toBe("Peace Arch50 minNEXUS 5 min20 min");
    expect(rows.map((r) => [...r.querySelectorAll(".bw-wait")].map((c) => c.className))).toEqual([
      ["bw-wait bw-3", "bw-wait bw-2"],
      ["bw-wait bw-1 bw-best", "bw-wait bw-old"],
    ]);
    expect(el.querySelector(".bw-foot")?.textContent).toMatch(/^Updated 4:00\s?p\.?m\.? · CBSA, U\.S\. CBP$/i);
    stop();
  });

  it("shows one direction only, and says which agency didn't answer", async () => {
    vi.useFakeTimers({ now: at });
    const data: BorderData = {
      updatedAt: at,
      down: { cbsa: true, cbp: false },
      crossings: [{ id: "peaceArch", name: "Peace Arch", toUS: { minutes: 30, closed: false, at }, toCanada: null }],
    };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const stop = borderWait(el, { ...newWidget("borderWait", "bw2", { x: 0, y: 0 }), directions: "toCanada" }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".bw-head")?.textContent).toBe("To Canada");
    expect(el.querySelector(".bw-foot")?.textContent).toBe("CBSA didn't answer");
    stop();
  });
});
