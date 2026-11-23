import { describe, expect, it } from "vitest";

import { trimWeatherUnderground } from "./weatherUnderground";

describe("Weather Underground trim", () => {
  it("reads a metric PWS observation", () => {
    const data = trimWeatherUnderground(
      {
        observations: [
          {
            metric: { temp: 7.2, humidity: 91, windSpeed: 4, windGust: 9, precipRate: 0.5, precipTotal: 3.1 },
            obsTimeLocal: "2026-11-23 8:00 AM",
          },
        ],
      },
      "metric",
      1,
    );
    expect(data).toMatchObject({ temp: 7.2, humidity: 91, wind: 4, rainToday: 3.1, observedAt: "2026-11-23 8:00 AM" });
  });
});
