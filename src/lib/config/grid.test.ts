import { describe, expect, it } from "vitest";

import { cellAt, clampRect, findSpot, fits, overlaps, refit, resizeFrom, stackOrder } from "./grid";

const grid = { cols: 12, rows: 8 };

describe("grid", () => {
  it("knows when two widgets overlap", () => {
    expect(overlaps({ x: 0, y: 0, w: 3, h: 2 }, { x: 2, y: 1, w: 2, h: 2 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 3, h: 2 }, { x: 3, y: 0, w: 2, h: 2 })).toBe(false);
  });

  it("keeps a widget on the grid", () => {
    expect(clampRect({ x: 11, y: 7, w: 3, h: 2 }, grid)).toEqual({ x: 9, y: 6, w: 3, h: 2 });
    expect(clampRect({ x: -2, y: 0, w: 20, h: 1 }, grid)).toEqual({ x: 0, y: 0, w: 12, h: 1 });
    expect(clampRect({ x: 0, y: 0, w: 1, h: 1 }, grid, { w: 2, h: 2 })).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  describe("resizing from a corner", () => {
    const w = { x: 4, y: 2, w: 3, h: 2 }; // columns 4–6, rows 2–3

    it("keeps the opposite corner fixed", () => {
      expect(resizeFrom(w, "se", { x: 8, y: 5 }, grid)).toEqual({ x: 4, y: 2, w: 5, h: 4 });
      expect(resizeFrom(w, "nw", { x: 2, y: 0 }, grid)).toEqual({ x: 2, y: 0, w: 5, h: 4 });
      expect(resizeFrom(w, "ne", { x: 9, y: 1 }, grid)).toEqual({ x: 4, y: 1, w: 6, h: 3 });
      expect(resizeFrom(w, "sw", { x: 3, y: 6 }, grid)).toEqual({ x: 3, y: 2, w: 4, h: 5 });
    });

    it("shrinks from any corner", () => {
      expect(resizeFrom(w, "nw", { x: 6, y: 3 }, grid)).toEqual({ x: 6, y: 3, w: 1, h: 1 });
      expect(resizeFrom(w, "ne", { x: 4, y: 3 }, grid)).toEqual({ x: 4, y: 3, w: 1, h: 1 });
    });

    it("never goes below the minimum size or past the opposite corner", () => {
      expect(resizeFrom(w, "nw", { x: 11, y: 7 }, grid, { w: 2, h: 2 })).toEqual({ x: 5, y: 2, w: 2, h: 2 });
      expect(resizeFrom(w, "se", { x: 0, y: 0 }, grid, { w: 2, h: 1 })).toEqual({ x: 4, y: 2, w: 2, h: 1 });
    });

    it("stays on the grid", () => {
      expect(resizeFrom(w, "nw", { x: -3, y: -1 }, grid)).toEqual({ x: 0, y: 0, w: 7, h: 4 });
      expect(resizeFrom(w, "se", { x: 20, y: 20 }, grid)).toEqual({ x: 4, y: 2, w: 8, h: 6 });
    });

    it("still refuses a size that covers another widget, but may cover photos", () => {
      const r = resizeFrom(w, "nw", { x: 0, y: 0 }, grid);
      expect(fits({ ...r, type: "clock" }, grid, [{ x: 0, y: 0, w: 2, h: 1, type: "weather" }])).toBe(false);
      expect(fits({ ...r, type: "clock" }, grid, [{ x: 0, y: 0, w: 4, h: 4, type: "photos" }])).toBe(true);
    });
  });

  it("refuses a spot that is taken or off the grid", () => {
    const others = [{ x: 0, y: 0, w: 6, h: 3 }];
    expect(fits({ x: 6, y: 0, w: 6, h: 3 }, grid, others)).toBe(true);
    expect(fits({ x: 5, y: 0, w: 2, h: 1 }, grid, others)).toBe(false);
    expect(fits({ x: 11, y: 0, w: 2, h: 1 }, grid, others)).toBe(false);
  });

  it("finds the first free spot, shrinking only when it must", () => {
    const others = [{ x: 0, y: 0, w: 12, h: 6 }];
    expect(findSpot({ w: 3, h: 2 }, grid, others)).toEqual({ x: 0, y: 6, w: 3, h: 2 });
    expect(findSpot({ w: 3, h: 3 }, grid, others)).toEqual({ x: 0, y: 6, w: 3, h: 2 });
    expect(findSpot({ w: 2, h: 2 }, grid, [{ x: 0, y: 0, w: 12, h: 8 }])).toBeNull();
  });

  it("turns a pointer position into a cell", () => {
    const box = { width: 1310, height: 870 }; // 12 × 8 cells of 100 px with 10 px gaps
    expect(cellAt(0, 0, box, grid, 10)).toEqual({ x: 0, y: 0 });
    expect(cellAt(215, 105, box, grid, 10)).toEqual({ x: 1, y: 0 });
    expect(cellAt(225, 115, box, grid, 10)).toEqual({ x: 2, y: 1 });
    expect(cellAt(5000, -10, box, grid, 10)).toEqual({ x: 11, y: 0 });
  });

  it("refits widgets when the grid shrinks", () => {
    const widgets = [
      { id: "clock", x: 0, y: 0, w: 4, h: 2 },
      { id: "weather", x: 8, y: 0, w: 4, h: 3 },
      { id: "photos", x: 0, y: 4, w: 12, h: 4 },
    ];
    const { kept, dropped } = refit(widgets, { cols: 8, rows: 4 });
    expect(kept.map((w) => [w.id, w.x, w.y, w.w, w.h])).toEqual([
      ["clock", 0, 0, 4, 2],
      ["weather", 4, 0, 4, 3],
      ["photos", 0, 2, 4, 2],
    ]);
    expect(dropped).toEqual([]);
    expect(refit(widgets, { cols: 4, rows: 2 }).dropped.map((w) => w.id)).toEqual(["weather", "photos"]);
  });

  describe("widgets on top of photos", () => {
    const photos = { x: 0, y: 0, w: 12, h: 8, type: "photos" };

    it("lets a widget sit on a photos widget, but not on another widget or two photos on each other", () => {
      const clock = { x: 0, y: 0, w: 3, h: 2, type: "clock" };
      expect(fits(clock, grid, [photos])).toBe(true);
      expect(fits(photos, grid, [clock])).toBe(true);
      expect(fits({ x: 2, y: 1, w: 3, h: 2, type: "weather" }, grid, [photos, clock])).toBe(false);
      expect(fits({ x: 6, y: 4, w: 2, h: 2, type: "photos" }, grid, [photos])).toBe(false);
    });

    it("puts a new widget in empty cells first, and on the photos only when nothing else is free", () => {
      const half = { x: 0, y: 0, w: 12, h: 6, type: "photos" };
      expect(findSpot({ w: 3, h: 2, type: "clock" }, grid, [half])).toEqual({ x: 0, y: 6, w: 3, h: 2 });
      expect(findSpot({ w: 3, h: 2, type: "clock" }, grid, [photos])).toEqual({ x: 0, y: 0, w: 3, h: 2 });
      expect(findSpot({ w: 3, h: 2, type: "photos" }, grid, [photos])).toBeNull();
    });

    it("keeps widgets on the photos when the grid shrinks", () => {
      const widgets = [
        { id: "photos", ...photos },
        { id: "clock", x: 0, y: 0, w: 4, h: 2, type: "clock" },
      ];
      expect(refit(widgets, { cols: 8, rows: 4 }).kept.map((w) => [w.id, w.x, w.y, w.w, w.h])).toEqual([
        ["photos", 0, 0, 8, 4],
        ["clock", 0, 0, 4, 2],
      ]);
    });

    it("draws photos first and marks the widgets on top of them", () => {
      const order = stackOrder([
        { id: "clock", x: 0, y: 0, w: 3, h: 2, type: "clock" },
        { id: "photos", x: 0, y: 0, w: 8, h: 8, type: "photos" },
        { id: "agenda", x: 8, y: 0, w: 4, h: 8, type: "agenda" },
      ]);
      expect(order.map((o) => [o.widget.id, o.onPhoto])).toEqual([
        ["photos", false],
        ["clock", true],
        ["agenda", false],
      ]);
    });
  });
});
