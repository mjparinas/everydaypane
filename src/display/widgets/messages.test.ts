// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import type { BoardMessage, DisplayPayload } from "@/lib/display/types";

import { messages } from "./messages";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the latest note visible when older pins fill the tile", async () => {
  vi.useFakeTimers();
  const note = (text: string, createdAt: number, pinned: boolean): BoardMessage => ({
    id: text,
    author: "Sam",
    text,
    colour: "pink",
    createdAt,
    pinned,
  });
  const data = { messages: [note("First pin", 2, true), note("Second pin", 1, true), note("Latest", 3, false)] };
  vi.stubGlobal("fetch", async () => Response.json(data));
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return [...this.querySelectorAll<HTMLElement>(".msg")].filter((m) => m.style.display !== "none").length * 20;
  });
  const el = document.createElement("div");
  const stop = messages(
    el,
    { id: "board", type: "messages", x: 0, y: 0, w: 2, h: 2, showBackground: true, count: 2, allowAdd: false },
    { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true },
  );
  try {
    await vi.advanceTimersByTimeAsync(100);
    const rows = [...el.querySelectorAll<HTMLElement>(".msg")];
    expect(rows.map((m) => m.querySelector(".msg-text")?.textContent)).toEqual(["First pin", "Latest"]);
    expect(rows.map((m) => m.style.display)).toEqual(["none", ""]);
  } finally {
    stop();
  }
});
