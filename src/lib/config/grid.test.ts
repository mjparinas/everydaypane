import { describe, expect, it } from "vitest";

import { cellAt, clampRect, findSpot, fits, overlaps, refit } from "./grid";

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
});
