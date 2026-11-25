// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { beginActivity, connectionStatus, get, isUpdating, retryDelay, subscribe } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("display polling", () => {
  it("tracks active API requests until all finish", () => {
    const endOne = beginActivity();
    expect(isUpdating()).toBe(true);
    const endTwo = beginActivity();
    endOne();
    expect(isUpdating()).toBe(true);
    endTwo();
    expect(isUpdating()).toBe(false);
  });

  it("shows server failure separately and clears it after a successful request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await get("server-down");
    expect(connectionStatus).toBe("server-offline");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await get("server-back");
    expect(connectionStatus).toBe("online");
  });

  it("backs off repeated failures without exceeding the configured cap", () => {
    expect([1, 2, 3, 10].map((failures) => retryDelay(30_000, failures))).toEqual([30_000, 60_000, 120_000, 900_000]);
  });

  it("sends a feed ETag and accepts a 304 without replacing cached data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"feed-v1"', "x-display-release": "release-v2" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await get("conditional-test", {}, '"feed-v1"');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { "if-none-match": '"feed-v1"' } });
    expect(response).toMatchObject({
      data: null,
      etag: '"feed-v1"',
      notModified: true,
      live: true,
      releaseVersion: "release-v2",
    });
  });

  it("pauses shared feed requests while hidden and resumes immediately when visible", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ value: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const stop = subscribe<{ value: number }>("visibility-test", 1000, () => undefined);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });
});
