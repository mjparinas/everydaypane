import { describe, expect, it } from "vitest";

import { trimTempest } from "./tempest";

describe("Tempest trim", () => {
  it("reads station observations in metric", () => {
    const data = trimTempest(
      {
        obs: [
          {
            air_temperature: 12.4,
            relative_humidity: 88,
            wind_avg: 3.2,
            wind_gust: 5.1,
            precip_accum_local_day: 1.5,
          },
        ],
      },
      "metric",
      1,
    );
    expect(data).toMatchObject({ temp: 12.4, humidity: 88, wind: 3, gust: 5, rain: 1.5 });
  });
});
