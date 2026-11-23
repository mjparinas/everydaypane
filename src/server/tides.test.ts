import { describe, expect, it } from "vitest";

import { trimNoaaStations } from "./tides";

describe("tide stations", () => {
  it("trims NOAA station search results", () => {
    expect(
      trimNoaaStations({
        stations: [
          { id: "9447130", name: "Seattle", state: "WA" },
          { id: "9414290", name: "San Francisco", state: "CA" },
        ],
      }),
    ).toEqual([
      { id: "9447130", name: "Seattle", region: "WA" },
      { id: "9414290", name: "San Francisco", region: "CA" },
    ]);
  });
});
