// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiUrl, beginActivity, connectionStatus, get, isUpdating, retryDelay, subscribe } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("display polling", () => {
  it("keeps widget query parameters intact and merges additional parameters", () => {
    expect(apiUrl("brief?w=kids")).toBe("/api/display/brief/?w=kids");
    expect(apiUrl("trello?board=family&lists=4&cards=6", { cards: "8" })).toBe("/api/display/trello/?board=family&lists=4&cards=8");
    const address = new URL(apiUrl("affirmation?category=general&custom=A%20good%20day%20%26%20night"), "https://example.test");
    expect(address.searchParams.get("custom")).toBe("A good day & night");
  });

  it("tracks active API requests until all finish", () => {
    const endOne = beginActivity();
    expect(isUpdating()).toBe(true);
    const endTwo = beginActivity();
    endOne();
    expect(isUpdating()).toBe(true);
    endTwo();
    expect(isUpdating()).toBe(false);
  });

  it("does not show Updating for a background long-poll held open", async () => {
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => (answer = resolve))));
    const pending = get("config-watch", { since: "1" }, undefined, { background: true });
    expect(isUpdating()).toBe(false);
    answer(Response.json({ version: 1 }));
    await pending;
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

  it("keeps 400 responses and malformed JSON from crashing or marking the server unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad request", { status: 400 })));
    await expect(get("bad-request")).resolves.toMatchObject({ data: null, live: false, unauthorized: false });
    expect(connectionStatus).toBe("online");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>deploying</html>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    await expect(get("malformed-json")).resolves.toMatchObject({ data: null, live: false, unauthorized: false });
  });

  it("reports expired auth separately and accepts no-content responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(get("expired")).resolves.toMatchObject({ unauthorized: true, live: false });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(get("no-content")).resolves.toMatchObject({ data: null, live: true, unauthorized: false });
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
