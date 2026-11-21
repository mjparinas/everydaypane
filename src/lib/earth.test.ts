import { describe, expect, it } from "vitest";

import { earthUrl, type EarthView } from "./earth";

const langley: EarthView = { latitude: 49.10107, longitude: -122.65883, zoom: "region", overlay: "wind", showPlace: true, animate: true };

describe("earthUrl", () => {
  it("centres on the place, rounded to about a kilometre, with the zoom from the cell's short side", () => {
    expect(earthUrl(langley, 900, 600)).toBe(
      "https://earth.nullschool.net/#current/wind/surface/level/orthographic=-122.66,49.1,2400/loc=-122.66,49.1",
    );
  });

  it("frames the same area in a bigger cell with a bigger zoom", () => {
    expect(earthUrl({ ...langley, zoom: "local", showPlace: false }, 1920, 1080)).toBe(
      "https://earth.nullschool.net/#current/wind/surface/level/orthographic=-122.66,49.1,16200",
    );
  });

  it("names the overlay and switches the animation off", () => {
    expect(earthUrl({ ...langley, overlay: "temp", animate: false, showPlace: false, zoom: "globe" }, 400, 400)).toBe(
      "https://earth.nullschool.net/#current/wind/surface/level/overlay=temp/orthographic=-122.66,49.1,180/anim=off",
    );
    expect(earthUrl({ ...langley, overlay: "off", showPlace: false }, 400, 400)).toContain("/overlay=off/");
  });

  it("never asks for a zoom below earth's smallest, even before the cell is laid out", () => {
    expect(earthUrl({ ...langley, zoom: "globe", showPlace: false }, 0, 0)).toContain(",100");
  });
});
