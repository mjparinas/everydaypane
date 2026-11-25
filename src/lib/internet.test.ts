import { describe, expect, it } from "vitest";

import { longEnough, mbps, median, nextSpeedAt, speedText, summarize, trimHistory, type PingReading } from "./internet";

const at = (i: number) => 1_000_000 + i * 30_000;
const readings = (...ms: (number | null)[]): PingReading[] => ms.map((m, i) => ({ at: at(i), ms: m }));

describe("internet arithmetic", () => {
  it("takes the middle ping", () => {
    expect(median([40, 12, 14])).toBe(14);
    expect(median([10, 20])).toBe(15);
    expect(median([])).toBeNull();
  });

  it("says online, slow or offline", () => {
    expect(summarize([], 100).status).toBe("checking");
    expect(summarize(readings(12, 14), 100)).toEqual({ status: "online", ms: 14, loss: 0 });
    expect(summarize(readings(12, 140), 100).status).toBe("slow");
    // One missed check keeps the last good ping; two in a row is offline.
    expect(summarize(readings(12, 14, null), 100)).toEqual({ status: "online", ms: 14, loss: 33 });
    expect(summarize(readings(12, null, null), 100)).toEqual({ status: "offline", ms: null, loss: 67 });
    expect(summarize(readings(null), 100).status).toBe("offline");
  });

  it("drops readings older than the graph after a long gap", () => {
    const h = readings(10, 11, 12);
    expect(trimHistory(h, at(2), 30)).toHaveLength(3);
    expect(trimHistory(h, at(2) + 10 * 3_600_000, 30)).toEqual([]);
  });

  it("writes speeds the way people say them", () => {
    expect(mbps(10_000_000, 800)).toBe(100);
    expect(speedText(8.42)).toBe("8.4 Mbps");
    expect(speedText(312.4)).toBe("312 Mbps");
    expect(speedText(1240)).toBe("1.2 Gbps");
    expect(speedText(null)).toBe("–");
  });

  it("moves to a bigger download until one takes a second", () => {
    const sizes = [1, 2, 3];
    expect(longEnough(200, 0, sizes)).toBe(false);
    expect(longEnough(1200, 0, sizes)).toBe(true);
    expect(longEnough(200, 2, sizes)).toBe(true);
  });

  it("schedules speed tests", () => {
    const start = 5_000_000_000;
    expect(nextSpeedAt(null, 0, start)).toBeNull();
    expect(nextSpeedAt(null, 6, start)).toBe(start + 60_000);
    expect(nextSpeedAt({ at: start - 3_600_000, down: 200, up: 20 }, 6, start)).toBe(start + 5 * 3_600_000);
    // A failed test is tried again after half an hour, not six.
    expect(nextSpeedAt({ at: start, down: null, up: null }, 6, start)).toBe(start + 30 * 60_000);
    // Long overdue still waits a minute after the screen loads.
    expect(nextSpeedAt({ at: start - 48 * 3_600_000, down: 200, up: 20 }, 6, start)).toBe(start + 60_000);
  });
});
