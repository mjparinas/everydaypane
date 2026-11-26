// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload } from "@/lib/display/types";

import { internet } from "./widgets/internet";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const w = newWidget("internet", "net", { x: 0, y: 0 });

// Cloudflare isn't reachable from tests: a stand-in whose answers take a set time on a fake performance clock.
let clock = 0;
let pingMs = 12;
let downMbps = 100;
let upMbps = 20;
let failing = false;
const calls: string[] = [];

function fakeFetch(url: string, init?: RequestInit) {
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (failing) return Promise.reject(new TypeError("Failed to fetch"));
  const u = new URL(url);
  if (u.pathname === "/__up") {
    const size = (init?.body as Uint8Array).byteLength;
    clock += pingMs + (size * 8) / (upMbps * 1000);
    return Promise.resolve({ ok: true, status: 200, body: null, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
  }
  const bytes = Number(u.searchParams.get("bytes"));
  clock += pingMs;
  return Promise.resolve({
    ok: true,
    status: 200,
    body: null,
    arrayBuffer: () => {
      clock += (bytes * 8) / (downMbps * 1000);
      return Promise.resolve({ byteLength: bytes });
    },
  });
}

function mount() {
  const cell = document.createElement("section");
  document.body.append(cell);
  return { cell, stop: internet(cell, w, ctx) };
}

const text = (cell: Element, sel: string) => cell.querySelector(sel)?.textContent;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-21T20:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
  clock = 0;
  pingMs = 12;
  downMbps = 100;
  upMbps = 20;
  failing = false;
  calls.length = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("internet widget", () => {
  it("shows the ping and only talks to Cloudflare", async () => {
    const { cell, stop } = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(cell, ".in-ms")).toBe("12 ms");
    expect(text(cell, ".in-status")).toBe("Online");
    expect(calls).toEqual(Array(3).fill("GET https://speed.cloudflare.com/__down?bytes=0"));
    expect(cell.querySelector(".in-line")).not.toBeNull();
    stop();
  });

  it("turns amber when slow and red when two checks in a row fail", async () => {
    pingMs = 250;
    const { cell, stop } = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(cell, ".in-status")).toBe("Slow");
    failing = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(text(cell, ".in-status")).toBe("Slow");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cell.querySelector(".w-internet")?.getAttribute("data-status")).toBe("offline");
    expect(text(cell, ".in-ms")).toBe("–");
    stop();
  });

  it("runs a speed test a minute after it starts (B.C. is on UTC−7 all year), stepping up the size, then waits the set hours", async () => {
    const { cell, stop } = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(cell, ".in-speed")).toBe("Speed test soon");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(cell, ".in-speed")).toBe("↓ 100 Mbps · ↑ 20 Mbps · 1:01 PM");
    // 1 MB and 10 MB were too quick to trust at 100 Mbps; 50 MB took four seconds.
    expect(calls.filter((c) => c.includes("bytes=") && !c.endsWith("bytes=0"))).toEqual([
      "GET https://speed.cloudflare.com/__down?bytes=1000000",
      "GET https://speed.cloudflare.com/__down?bytes=10000000",
      "GET https://speed.cloudflare.com/__down?bytes=50000000",
    ]);
    calls.length = 0;
    await vi.advanceTimersByTimeAsync(5 * 3_600_000);
    expect(calls.some((c) => c.includes("bytes=1000000"))).toBe(false);
    stop();
  });

  it("tests the speed on a tap and keeps the readings across a reload", async () => {
    const first = mount();
    await vi.advanceTimersByTimeAsync(0);
    (first.cell.querySelector(".w-internet") as HTMLElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(first.cell, ".in-speed")).toMatch(/^↓ 100 Mbps/);
    first.stop();
    first.cell.remove();
    calls.length = 0;

    const again = mount();
    expect(text(again.cell, ".in-speed")).toMatch(/^↓ 100 Mbps/);
    await vi.advanceTimersByTimeAsync(60_000);
    // The test was just done, so the reload doesn't run another one.
    expect(calls.every((c) => c.endsWith("bytes=0"))).toBe(true);
    again.stop();
  });
});

describe("loading the internet widget on its own", () => {
  it("leaves the cell empty, without an error, when its file can't be fetched", async () => {
    const { lazyWidget } = await import("./widgets/lazy");
    const cell = document.createElement("section");
    const stop = lazyWidget("internet", cell, w, ctx);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(cell.querySelector(".w-internet")).toBeNull();
  });
});
