import { describe, expect, it } from "vitest";

import { useTestServer } from "@/test/server";

import { cached, clearMemoryCache, forget } from "./cache";

describe("upstream cache", () => {
  useTestServer();

  it("serves a fresh copy without refetching, and refetches after the TTL", async () => {
    clearMemoryCache();
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    expect((await cached("k", 1000, load, 0)).value).toBe(1);
    expect((await cached("k", 1000, load, 500)).value).toBe(1);
    expect((await cached("k", 1000, load, 1500)).value).toBe(2);
  });

  it("keeps the last good copy when the upstream fails, and survives a cold start", async () => {
    clearMemoryCache();
    await cached("w", 1000, () => Promise.resolve("sunny"), 0);
    clearMemoryCache(); // a new serverless instance
    const r = await cached("w", 1000, () => Promise.reject(new Error("down")), 5000);
    expect(r).toEqual({ value: "sunny", fetchedAt: 0, stale: true });
  });

  it("fails when there is no copy at all", async () => {
    clearMemoryCache();
    await expect(cached("none", 1000, () => Promise.reject(new Error("down")))).rejects.toThrow("down");
  });

  it("does not keep a value that finishes loading after it was forgotten", async () => {
    clearMemoryCache();
    let finish: (value: string) => void = () => undefined;
    let started: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = cached(
      "weather:x",
      60_000,
      () => {
        started();
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
      0,
    );
    await gate;
    await forget("weather:");
    finish("fresh");
    expect(await first).toEqual({ value: "fresh", fetchedAt: 0, stale: true });
    const second = await cached("weather:x", 60_000, () => Promise.resolve("again"), 1);
    expect(second).toEqual({ value: "again", fetchedAt: 1, stale: false });
  });

  it("shares one fetch between parallel callers", async () => {
    clearMemoryCache();
    let calls = 0;
    const load = () => new Promise<number>((r) => setTimeout(() => r(++calls), 10));
    const [a, b] = await Promise.all([cached("p", 1000, load), cached("p", 1000, load)]);
    expect([a.value, b.value, calls]).toEqual([1, 1, 1]);
  });

  it("does not let an in-flight load rewrite the cache after forget", async () => {
    clearMemoryCache();
    let release: (v: string) => void = () => undefined;
    let started: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = cached(
      "tasks:x",
      60_000,
      () => {
        started();
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
      0,
    );
    await gate;
    await forget("tasks:");
    release("old-list");
    const after = await pending;
    expect(after).toEqual({ value: "old-list", fetchedAt: 0, stale: true });
    const next = await cached("tasks:x", 60_000, () => Promise.resolve("new-list"), 1);
    expect(next).toEqual({ value: "new-list", fetchedAt: 1, stale: false });
  });
});
