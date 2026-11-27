// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { messagePopups } from "./popups";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each([
  ["a failure", "2026-11-26T20:00:00Z"],
  ["an offline copy", "2026-11-26T21:00:00Z"],
])("recovers popup state after %s while the board stays unchanged", async (firstReply, now) => {
  vi.useFakeTimers({ now: new Date(now) });
  let stateReads = 0;
  let unchangedReads = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.includes("/messages/")) {
      if (new Headers(init.headers).has("if-none-match")) {
        unchangedReads++;
        return new Response(null, { status: 304 });
      }
      const messages = [{ id: "note", author: "Sam", text: "Pickup at five", colour: "pink", createdAt: 200 }];
      return Response.json({ messages }, { headers: { etag: '"unchanged"' } });
    }
    if (++stateReads !== 1) return Response.json({ since: 100, dismissed: [] });
    return firstReply === "a failure"
      ? new Response(null, { status: 502 })
      : Response.json({ since: 200, dismissed: [] }, { headers: { "x-offline": "1" } });
  });

  const { el, stop } = messagePopups();
  try {
    await vi.advanceTimersByTimeAsync(100);
    expect(el.querySelector(".pop-text")).toBeNull();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(unchangedReads).toBeGreaterThan(0);
    expect(stateReads).toBe(2);
    expect(el.querySelector(".pop-text")?.textContent).toBe("Pickup at five");
  } finally {
    stop();
  }
});
