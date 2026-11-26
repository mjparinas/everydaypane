// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload, PoolData } from "@/lib/display/types";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const NOW = Date.parse("2026-07-15T13:00:00-07:00");
const data: PoolData = {
  updatedAt: NOW,
  configured: true,
  pools: [
    {
      id: "pool-1",
      name: "Backyard",
      recorded: Date.parse("2026-07-15T12:40:00-07:00"),
      readings: [
        { kind: "temp", value: 26.4, unit: "°C", level: "ok", trend: "up", ideal: { min: 20, max: 40 } },
        { kind: "ph", value: 8.3, unit: "", level: "bad", ideal: { min: 7.2, max: 7.6 } },
        { kind: "orp", value: 702, unit: "mV", level: "ok" },
        { kind: "salinity", value: 3.1, unit: "g/L", level: "none" },
      ],
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

// A fresh copy of the widget (and the feeds it shares) for each test, so one test's answer isn't served to the next.
async function show(d: PoolData, w = newWidget("blueRiiot", "p", { x: 0, y: 0 })) {
  vi.resetModules();
  const { blueRiiot } = await import("./blueRiiot");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(d))),
  );
  const el = document.createElement("div");
  return { el, stop: blueRiiot(el, w, ctx) };
}

describe("pool widget", () => {
  it("colours each reading by its level and says when the pool was measured", async () => {
    vi.useFakeTimers({ now: NOW });
    const { el, stop } = await show(data);
    await vi.advanceTimersByTimeAsync(0);
    const rows = [...el.querySelectorAll(".pl-r")].map((r) => [r.className, r.textContent]);
    expect(rows).toEqual([
      ["pl-r pl-ok", "Water26.4 °C ↑"],
      ["pl-r pl-bad", "pH8.3"],
      ["pl-r pl-ok", "ORP702 mV"],
      ["pl-r pl-none", "Salt3.1 g/L"],
    ]);
    expect(el.querySelector(".pl-name")?.textContent).toBe("Backyard");
    expect(el.querySelector(".pl-when")?.textContent).toBe("Measured 12:40 PM");
    stop();
  });

  it("shows only the picked readings, and the day for an old measurement", async () => {
    vi.useFakeTimers({ now: NOW + 26 * 3_600_000 });
    const { el, stop } = await show(data, { ...newWidget("blueRiiot", "p2", { x: 0, y: 0 }), readings: ["ph"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelectorAll(".pl-r")).toHaveLength(1);
    expect(el.querySelector(".pl-stale .pl-when")?.textContent).toBe("Measured Jul 15, 12:40 PM");
    stop();
  });

  it("points at Settings until Blue Riiot is connected", async () => {
    vi.useFakeTimers({ now: NOW });
    const { el, stop } = await show({ updatedAt: NOW, configured: false, pools: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Connect Blue Riiot in Settings › Pool");
    stop();
  });
});
