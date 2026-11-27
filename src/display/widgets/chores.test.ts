// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import type { ChoresData, DisplayPayload } from "@/lib/display/types";

import { chores } from "./chores";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("follows Vancouver time across noon while the chore feed stays unchanged", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-26T18:59:30Z") });
  const NativeFormatter = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
    return new NativeFormatter(locales, options?.timeZone === "America/Vancouver" ? { ...options, timeZone: "Etc/GMT+8" } : options);
  });
  const data: ChoresData = {
    today: "2026-11-26",
    pinSet: false,
    rewards: [],
    people: [{ id: "kid", name: "Sam", emoji: "", color: "#000000", goal: 0, stars: 0, available: 0 }],
    chores: [
      { id: "am", name: "Make bed", emoji: "", stars: 1, period: "morning" },
      { id: "pm", name: "Walk dog", emoji: "", stars: 1, period: "afternoon" },
    ],
    due: ["am", "pm"].map((choreId) => ({ choreId, personId: "kid", done: false })),
  };
  const fetch = vi.fn(async () => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  const el = document.createElement("div");
  const stop = chores(
    el,
    {
      id: "chart",
      type: "chores",
      x: 0,
      y: 0,
      w: 6,
      h: 4,
      showBackground: true,
      personIds: [],
      showStars: true,
      allowCheck: true,
      layout: "byPeriod",
    },
    { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true },
  );
  try {
    await vi.advanceTimersByTimeAsync(100);
    expect(el.querySelector(".ch-band-now .ch-band-label")?.textContent).toBe("Morning");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(el.querySelector(".ch-band-now .ch-band-label")?.textContent).toBe("Afternoon");
    expect(fetch).toHaveBeenCalledOnce();
  } finally {
    stop();
  }
});
