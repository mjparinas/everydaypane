// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload } from "@/lib/display/types";
import type { GasData, GasStation } from "@/lib/gas";

import { ageText, gasPrices } from "./gasPrices";

const at = Date.parse("2026-11-26T23:00:00Z"); // 4 PM in Langley (UTC−7 all year from 2026)
const ctx = { payload: { units: "metric" } as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const station = (name: string, km: number, regular: number, age = 3_600_000): GasStation => ({
  id: name,
  name,
  address: `${name} St, Langley`,
  km,
  currency: "CAD",
  prices: { regular: { price: regular, at: at - age } },
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function draw(data: GasData, widget: Partial<ReturnType<typeof newWidget<"gasPrices">>> = {}, payload = ctx.payload) {
  vi.useFakeTimers({ now: at });
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
  const el = document.createElement("div");
  const stop = gasPrices(el, { ...newWidget("gasPrices", `g${Math.random()}`, { x: 0, y: 0 }), ...widget }, { ...ctx, payload });
  await vi.advanceTimersByTimeAsync(0);
  return { el, stop };
}

describe("gas prices widget", () => {
  it("says how old a price is", () => {
    expect(ageText(0, at)).toBe("");
    expect(ageText(at - 60_000, at)).toBe("just now");
    expect(ageText(at - 40 * 60_000, at)).toBe("40 min ago");
    expect(ageText(at - 3 * 3_600_000, at)).toBe("3 h ago");
    expect(ageText(at - 26 * 3_600_000, at)).toBe("1 day ago");
  });

  it("lists the cheapest first, marks the cheapest, and credits Google Maps", async () => {
    const data: GasData = {
      updatedAt: at,
      missing: "",
      radiusKm: 5,
      stations: [station("Chevron", 1.2, 1.619), station("Costco", 2.1, 1.549, 30 * 60_000), station("Far", 9, 1.4)],
    };
    const { el, stop } = await draw(data, { showAddress: true });
    const rows = [...el.querySelectorAll(".gas-row")];
    expect(rows.map((r) => r.querySelector(".gas-price")?.textContent)).toEqual(["154.9¢", "161.9¢"]);
    expect(rows[0]!.className).toBe("gas-row gas-best");
    expect(rows[0]!.querySelector(".gas-addr")?.textContent).toBe("Costco St, Langley");
    expect(rows[0]!.querySelector(".gas-meta")?.textContent).toBe("2.1 km · 30 min ago");
    expect(el.querySelector(".w-label")?.textContent).toBe("Regular gas");
    expect(el.querySelector(".gas-foot")?.textContent).toMatch(/^Updated 4:00\s?p\.?m\.? · Google Maps$/i);
    stop();
  });

  it("shows miles on an imperial dashboard and never marks a lone or tied price", async () => {
    const data: GasData = { updatedAt: at, missing: "", radiusKm: 5, stations: [station("A", 1, 1.5), station("B", 2, 1.5)] };
    const { el, stop } = await draw(data, {}, { units: "imperial" } as DisplayPayload);
    expect(el.querySelector(".gas-best")).toBeNull();
    expect(el.querySelector(".gas-meta")?.textContent).toBe("0.6 mi · 1 h ago");
    stop();
  });

  it("says when it isn't set up, has nothing nearby, or Google failed", async () => {
    const none: GasData = { updatedAt: at, missing: "key", radiusKm: 5, stations: [] };
    let x = await draw(none);
    expect(x.el.querySelector(".w-empty")?.textContent).toBe("Gas prices aren't set up yet");
    x.stop();
    x = await draw({ ...none, missing: "" }, { fuel: "diesel" });
    expect(x.el.querySelector(".w-empty")?.textContent).toBe("No diesel prices nearby");
    x.stop();
    x = await draw({ ...none, missing: "", error: "Google answered 403" });
    expect(x.el.querySelector(".w-empty")?.textContent).toBe("Gas prices unavailable");
    x.stop();
  });
});
