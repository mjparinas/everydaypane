import { describe, expect, it } from "vitest";

import {
  BOARD_H,
  BOARD_W,
  boardPoint,
  clampStroke,
  colourCountForWidth,
  coloursForWidth,
  pointerToBoard,
  shouldAddPoint,
  WHITEBOARD_COLOURS,
} from "./whiteboard";

describe("whiteboard helpers", () => {
  it("shows more colours as the tile gets wider", () => {
    expect(colourCountForWidth(200)).toBe(3);
    expect(colourCountForWidth(360)).toBeGreaterThan(colourCountForWidth(200));
    expect(colourCountForWidth(800)).toBe(WHITEBOARD_COLOURS.length);
    expect(coloursForWidth(200)).toHaveLength(3);
    expect(coloursForWidth(800)).toEqual([...WHITEBOARD_COLOURS]);
  });

  it("skips points that barely moved", () => {
    expect(shouldAddPoint([], 10, 10)).toBe(true);
    expect(shouldAddPoint([10, 10], 11, 10)).toBe(false);
    expect(shouldAddPoint([10, 10], 20, 10)).toBe(true);
  });

  it("keeps points on the board", () => {
    expect(boardPoint(-5, 50)).toEqual({ x: 0, y: 50 });
    expect(boardPoint(BOARD_W + 9, BOARD_H + 2)).toEqual({ x: BOARD_W, y: BOARD_H });
    expect(boardPoint(12.6, 8.2)).toEqual({ x: 13, y: 8 });
  });

  it("maps a pointer through a letterboxed board", () => {
    const rect = { left: 100, top: 50, width: 320, height: 180 };
    expect(pointerToBoard(rect, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(pointerToBoard(rect, 100 + 160, 50 + 90)).toEqual({ x: BOARD_W / 2, y: BOARD_H / 2 });
  });

  it("trims a runaway stroke", () => {
    const points = Array.from({ length: 600 }, (_, i) => i);
    const stroke = clampStroke({ id: "a", tool: "pen", colour: "#111111", points, width: 10 });
    expect(stroke.points.length).toBeLessThanOrEqual(250);
    expect(stroke.points.length % 2).toBe(0);
  });
});
