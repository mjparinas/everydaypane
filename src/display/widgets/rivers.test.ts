// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { change, riverLine } from "./rivers";

describe("river levels widget", () => {
  it("writes changes in centimetres or inches with a sign", () => {
    expect(change(0.082, false)).toBe("+8.2 cm");
    expect(change(-0.24, false)).toBe("−24 cm");
    expect(change(0, false)).toBe("±0 cm");
    expect(change(0.1, true)).toBe("+3.9 in");
  });

  it("draws a near-flat day flat and breaks the line at gaps", () => {
    const flat = riverLine([2, 2.001, 2.002]);
    expect(flat).toHaveLength(1);
    for (const p of flat[0]!.split(" ")) expect(Number(p.split(",")[1])).toBeGreaterThan(10);
    expect(riverLine([1, 2, null, 3, 4])).toHaveLength(2);
    expect(riverLine([null, 1])).toEqual([]);
  });
});
