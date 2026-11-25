// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { batteryLevel, duration, watts } from "./widgets/ecoflow";

describe("EcoFlow widget wording", () => {
  it("writes power in watts, then kilowatts", () => {
    expect([watts(0), watts(412), watts(1800), watts(12_400)]).toEqual(["0 W", "412 W", "1.8 kW", "12 kW"]);
  });

  it("writes time left in minutes, hours or days", () => {
    expect([duration(45), duration(60), duration(190), duration(26 * 60)]).toEqual(["45 min", "1 h", "3 h 10 min", "1 d 2 h"]);
  });

  it("turns the battery bar amber under 30 % and red under 15 %", () => {
    expect([batteryLevel(80), batteryLevel(29), batteryLevel(14)]).toEqual([1, 2, 3]);
  });
});
