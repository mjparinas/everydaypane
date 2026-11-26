import { describe, expect, it } from "vitest";

import { hsvToHex, rgbToXy, xyToHex } from "./lightColour";

describe("light colours", () => {
  it("turns RGB into Hue's xy and back near enough for a swatch", () => {
    expect(rgbToXy(0xff0000)).toEqual({ x: 0.6401, y: 0.33 });
    expect(rgbToXy(0xffffff)).toEqual({ x: 0.3127, y: 0.329 });
    expect(rgbToXy(0)).toEqual({ x: 0.3127, y: 0.329 });
    expect(xyToHex(0.64, 0.33)).toBe("#ff0000");
    expect(xyToHex(0.3127, 0.329)).toBe("#ffffff");
    const { x, y } = rgbToXy(0x0a84ff);
    // Off by one step at most in a channel, which no eye sees on a bulb.
    expect(xyToHex(x, y)).toBe("#0984ff");
    expect(xyToHex(0.3, 0)).toBe("#ffffff");
  });

  it("reads LIFX's hue and saturation as a full-brightness colour", () => {
    expect(hsvToHex(0, 1)).toBe("#ff0000");
    expect(hsvToHex(120, 1)).toBe("#00ff00");
    expect(hsvToHex(240, 0.5)).toBe("#8080ff");
    expect(hsvToHex(720, 0)).toBe("#ffffff");
    expect(hsvToHex(Number.NaN, 2)).toBe("#ff0000");
  });
});
