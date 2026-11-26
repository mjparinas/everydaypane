// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { curvePaths } from "./tides";

describe("tide curve", () => {
  it("spans the box from the day's lowest to highest water", () => {
    const { line, area } = curvePaths([1, 3, 2]);
    expect(line).toBe("M0.0 94.0L240.0 6.0L480.0 50.0");
    expect(area).toBe(`${line}L480 100L0 100Z`);
  });
});
