import { describe, expect, it } from "vitest";

import { caption, fitFor, memoryYear, order, orientation, partnerIndex, pickKey, type Pick } from "./photoFrame";

const pick = (id: string, w: number, h: number, taken = ""): Pick => ({ source: "lib", photo: [id, w, h, taken] });

describe("photo frame", () => {
  it("tells portrait, landscape and square apart, and says unknown when a source gives no size", () => {
    expect(orientation(1080, 1920)).toBe("portrait");
    expect(orientation(1920, 1080)).toBe("landscape");
    expect(orientation(1000, 1050)).toBe("square");
    expect(orientation(0, 0)).toBe("unknown");
  });

  it("fills the frame unless that would crop a lot, when it shows the whole photo", () => {
    const frame = 16 / 9;
    expect(fitFor("auto", 3 / 2, frame)).toBe("cover");
    expect(fitFor("auto", 4 / 3, frame)).toBe("cover");
    expect(fitFor("auto", 3 / 4, frame)).toBe("contain");
    expect(fitFor("auto", 21 / 9, 9 / 16)).toBe("contain");
    expect(fitFor("cover", 3 / 4, frame)).toBe("cover");
    expect(fitFor("contain", 16 / 9, frame)).toBe("contain");
  });

  it("finds the next portrait to pair with a portrait in a landscape frame, a little way ahead only", () => {
    const queue = [pick("a", 1920, 1080), pick("b", 1920, 1280), pick("c", 1080, 1920)];
    expect(partnerIndex(queue, "landscape")).toBe(2);
    expect(partnerIndex(queue, "landscape", 2)).toBe(-1);
    expect(partnerIndex(queue, "portrait")).toBe(0);
    expect(partnerIndex([pick("u", 0, 0)], "landscape")).toBe(-1);
  });

  it("knows a photo from this day in an earlier year", () => {
    expect(memoryYear("2019-11-26", "2026-11-26")).toBe(2019);
    expect(memoryYear("2026-11-26", "2026-11-26")).toBeNull();
    expect(memoryYear("2019-11-25", "2026-11-26")).toBeNull();
    expect(memoryYear("", "2026-11-26")).toBeNull();
  });

  it("puts new photos first, then this day in earlier years, and every photo once", () => {
    const deck = [pick("old", 4, 3, "2020-02-01"), pick("memory", 4, 3, "2021-11-26"), pick("new", 4, 3), pick("other", 4, 3)];
    const fresh = new Set([pickKey(deck[2] as Pick)]);
    const out = order(deck, { today: "2026-11-26", memories: true, fresh }, () => 0.5);
    expect(out.map((p) => p.photo[0]).slice(0, 2)).toEqual(["new", "memory"]);
    expect(out).toHaveLength(4);
    const off = order(deck, { today: "2026-11-26", memories: false }, () => 0);
    expect(new Set(off.map((p) => p.photo[0]))).toEqual(new Set(["old", "memory", "new", "other"]));
  });

  it("captions with the date and how long ago, this day in earlier years, or a photo just added", () => {
    expect(caption("2023-11-14", "2026-11-26", { memories: true, fresh: false })).toBe("November 14, 2023 · 3 years ago");
    expect(caption("2026-08-01", "2026-11-26", { memories: true, fresh: false })).toBe("August 1, 2026");
    expect(caption("2025-11-26", "2026-11-26", { memories: true, fresh: false })).toBe("On this day · 2025 · a year ago");
    expect(caption("2025-11-26", "2026-11-26", { memories: false, fresh: false })).toBe("November 26, 2025 · a year ago");
    expect(caption("", "2026-11-26", { memories: true, fresh: true })).toBe("Just added");
    expect(caption("", "2026-11-26", { memories: true, fresh: false })).toBe("");
  });
});
