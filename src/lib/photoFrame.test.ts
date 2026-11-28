import { describe, expect, it } from "vitest";

import {
  caption,
  fitFor,
  memoryYear,
  order,
  orientation,
  partnerIndex,
  pickCachedPhoto,
  pickKey,
  rememberCachedPhoto,
  type CachedPick,
  type Pick,
} from "./photoFrame";

const pick = (id: string, w: number, h: number, taken = ""): Pick => ({ source: "lib", photo: [id, w, h, taken] });
const cached = (source: string, id: string): CachedPick => ({ source, photo: [id, 1200, 800, ""], url: `/p/${source}/${id}` });

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

  it("shuffles the whole deck, so every photo can come first and each turns up once", () => {
    const deck = ["a", "b", "c", "d", "e"].map((id) => pick(id, 4, 3));
    const firsts = new Set<string>();
    // A plain counter stands in for Math.random: each pass draws different numbers, as a real screen does.
    for (let pass = 0; pass < 5; pass++) {
      let n = pass;
      const out = order(deck, { today: "2026-11-27", memories: false }, () => (n++ * 0.37) % 1);
      expect(out.map((p) => p.photo[0]).sort()).toEqual(["a", "b", "c", "d", "e"]);
      firsts.add(out[0]?.photo[0] ?? "");
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("puts what this screen showed last at the end, so a reload or a new pass doesn't open on it", () => {
    const deck = ["a", "b", "c", "d"].map((id) => pick(id, 4, 3));
    // A random 0.99 leaves the shuffle as it was, so only the demotion moves anything.
    const out = order(deck, { today: "2026-11-27", memories: false, recent: ["a", "b"].map((id) => `lib\n${id}`) }, () => 0.99);
    expect(
      out
        .map((p) => p.photo[0])
        .slice(2)
        .sort(),
    ).toEqual(["a", "b"]);
    // Only the newer half of the deck counts, so a small album still shuffles rather than looping in one order.
    const small = order(deck, { today: "2026-11-27", memories: false, recent: ["a", "b", "c", "d"].map((id) => `lib\n${id}`) }, () => 0.99);
    expect(
      small
        .map((p) => p.photo[0])
        .slice(2)
        .sort(),
    ).toEqual(["c", "d"]);
  });

  it("leads with an On This Day photo once, not again after the screen reloads", () => {
    const deck = [pick("memory", 4, 3, "2021-11-27"), pick("x", 4, 3), pick("y", 4, 3), pick("z", 4, 3)];
    expect(order(deck, { today: "2026-11-27", memories: true }, () => 0.5)[0]?.photo[0]).toBe("memory");
    const after = order(deck, { today: "2026-11-27", memories: true, recent: ["lib\nmemory"] }, () => 0.5);
    expect(after.at(-1)?.photo[0]).toBe("memory");
  });

  it("captions with the date and how long ago, this day in earlier years, or a photo just added", () => {
    expect(caption("2023-11-14", "2026-11-26", { memories: true, fresh: false })).toBe("November 14, 2023 · 3 years ago");
    expect(caption("2026-08-01", "2026-11-26", { memories: true, fresh: false })).toBe("August 1, 2026");
    expect(caption("2025-11-26", "2026-11-26", { memories: true, fresh: false })).toBe("On this day · 2025 · a year ago");
    expect(caption("2025-11-26", "2026-11-26", { memories: false, fresh: false })).toBe("November 26, 2025 · a year ago");
    expect(caption("", "2026-11-26", { memories: true, fresh: true })).toBe("Just added");
    expect(caption("", "2026-11-26", { memories: true, fresh: false })).toBe("");
  });

  it("caps cached fallback photos per source and overall, and pulls a random one not already on screen", () => {
    let list: CachedPick[] = [];
    for (const id of ["a", "b", "c", "a"]) list = rememberCachedPhoto(list, cached("amz", id), 2, 3);
    expect(list.map((c) => c.photo[0])).toEqual(["c", "a"]);

    list = rememberCachedPhoto(list, cached("lib", "x"), 2, 3);
    list = rememberCachedPhoto(list, cached("lib", "y"), 2, 3);
    expect(list.map((c) => `${c.source}:${c.photo[0]}`)).toEqual(["amz:a", "lib:x", "lib:y"]);

    const wanted = new Set(["lib"]);
    expect(pickCachedPhoto(list, wanted, new Set(["lib\ny"]), () => 0.9)?.photo[0]).toBe("x");
    expect(pickCachedPhoto(list, new Set(["amz"]), new Set(["amz\na"]), () => 0.5)?.photo[0]).toBe("a");
    expect(pickCachedPhoto(list, new Set(["missing"]), new Set())?.photo[0]).toBeUndefined();
  });
});
