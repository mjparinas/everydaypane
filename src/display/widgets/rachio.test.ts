// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload, RachioData } from "@/lib/display/types";

import { rachio } from "./rachio";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const NOW = Date.parse("2026-11-25T12:00:00-07:00");
const START = Date.parse("2026-11-26T05:00:00-07:00");
const data: RachioData = {
  updatedAt: NOW,
  configured: true,
  controllers: [
    {
      id: "dev-front",
      name: "Front yard",
      online: true,
      rainDelayUntil: null,
      next: { start: START, name: "Lawn mornings", minutes: 25, zones: ["Front lawn", "Beds"] },
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function stub() {
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(Response.json(data));
    }),
  );
  return posts;
}

describe("sprinklers widget", () => {
  it("shows the next watering and skips it only on a second tap", async () => {
    vi.useFakeTimers({ now: NOW });
    const posts = stub();
    const el = document.createElement("div");
    const stop = rachio(el, newWidget("rachio", "r", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".rc-when")?.textContent).toBe("Tomorrow 5 AM");
    expect(el.querySelector(".rc-sub")?.textContent).toBe("Lawn mornings · 25 min");
    expect(el.querySelector(".rc-zones")?.textContent).toBe("Front lawn, Beds");

    el.querySelector<HTMLButtonElement>(".rc-skip")?.click();
    expect(posts).toEqual([]);
    expect(el.querySelector(".rc-skip")?.textContent).toBe("Tap again to skip");
    // Left alone, it goes back to plain Skip.
    await vi.advanceTimersByTimeAsync(4000);
    expect(el.querySelector(".rc-skip")?.textContent).toBe("Skip");

    el.querySelector<HTMLButtonElement>(".rc-skip")?.click();
    el.querySelector<HTMLButtonElement>(".rc-skip")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([{ controller: "dev-front", start: START }]);
    expect(el.textContent).toContain("Skipped");
    stop();
  });

  it("has no Skip button when the widget doesn't allow it", async () => {
    vi.useFakeTimers({ now: NOW });
    stub();
    const el = document.createElement("div");
    const stop = rachio(el, { ...newWidget("rachio", "r2", { x: 0, y: 0 }), allowSkip: false }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".rc-when")).not.toBeNull();
    expect(el.querySelector(".rc-skip")).toBeNull();
    stop();
  });
});
