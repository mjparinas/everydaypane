import { describe, expect, it } from "vitest";

import type { PackageTrack } from "@/lib/display/types";

import { deliveredEarlier, etaWhen, isToday, sortPackages, statusFrom17, timeFrom17 } from "./packages";

const TZ = "America/Vancouver";
const NOW = Date.UTC(2026, 10, 26, 18); // Thu Nov 26, 10 AM in Langley
const pkg = (id: string, over: Partial<PackageTrack>): PackageTrack => ({
  id,
  carrier: "other",
  trackingNumber: id,
  status: "inTransit",
  summary: "",
  ...over,
});

describe("package rules", () => {
  it("maps 17TRACK's statuses", () => {
    expect(
      ["InfoReceived", "InTransit", "OutForDelivery", "AvailableForPickup", "Delivered", "DeliveryFailure", "Expired", "NotFound"].map(
        statusFrom17,
      ),
    ).toEqual(["preTransit", "inTransit", "outForDelivery", "pickup", "delivered", "exception", "unknown", "unknown"]);
  });

  it("reads a bare date as that date in Vancouver, not the evening before", () => {
    const t = timeFrom17("2026-11-26");
    expect(t).toBeDefined();
    expect(etaWhen({ etaFrom: t }, NOW, TZ)).toBe("today");
    expect(timeFrom17("soon")).toBeUndefined();
    expect(timeFrom17(null)).toBeUndefined();
  });

  it("knows today, a later day, a missed day and a window that includes today", () => {
    expect(etaWhen({ etaFrom: timeFrom17("2026-11-28") }, NOW, TZ)).toBe("later");
    expect(etaWhen({ etaFrom: timeFrom17("2026-11-24") }, NOW, TZ)).toBe("late");
    expect(etaWhen({ etaFrom: timeFrom17("2026-11-25"), etaTo: timeFrom17("2026-11-27") }, NOW, TZ)).toBe("today");
    expect(etaWhen({}, NOW, TZ)).toBe("none");
  });

  it("counts out for delivery, pickup, due today and delivered today as today", () => {
    expect(isToday(pkg("a", { status: "outForDelivery" }), NOW, TZ)).toBe(true);
    expect(isToday(pkg("b", { status: "pickup" }), NOW, TZ)).toBe(true);
    expect(isToday(pkg("c", { etaFrom: timeFrom17("2026-11-26") }), NOW, TZ)).toBe(true);
    expect(isToday(pkg("d", { status: "delivered", deliveredAt: NOW - 3_600_000 }), NOW, TZ)).toBe(true);
    // 11 PM last night in Langley is yesterday, though it's the same UTC date.
    const lastNight = Date.UTC(2026, 10, 26, 6);
    expect(isToday(pkg("e", { status: "delivered", deliveredAt: lastNight }), NOW, TZ)).toBe(false);
    expect(deliveredEarlier(pkg("e", { status: "delivered", deliveredAt: lastNight }), NOW, TZ)).toBe(true);
    expect(isToday(pkg("f", { etaFrom: timeFrom17("2026-11-27") }), NOW, TZ)).toBe(false);
  });

  it("puts today's first, then problems, then by expected day, delivered last", () => {
    const list = [
      pkg("delivered", { status: "delivered", deliveredAt: NOW - 1000 }),
      pkg("monday", { etaFrom: timeFrom17("2026-11-30") }),
      pkg("saturday", { etaFrom: timeFrom17("2026-11-28") }),
      pkg("problem", { status: "exception" }),
      pkg("dueToday", { etaFrom: timeFrom17("2026-11-26") }),
      pkg("truck", { status: "outForDelivery" }),
    ];
    expect(sortPackages(list, NOW, TZ).map((p) => p.id)).toEqual(["truck", "dueToday", "problem", "saturday", "monday", "delivered"]);
  });
});
