import { describe, expect, it } from "vitest";

import { freeDefaultConfig } from "@/lib/config/defaults";

import { localise, placeFromHeaders, untouchedStarter } from "./firstLocation";

const toronto = new Headers({
  "x-vercel-ip-city": "Toronto",
  "x-vercel-ip-country": "CA",
  "x-vercel-ip-country-region": "ON",
  "x-vercel-ip-latitude": "43.6532",
  "x-vercel-ip-longitude": "-79.3832",
  "x-vercel-ip-timezone": "America/Toronto",
});

describe("first visit location", () => {
  it("reads the visitor's city from Vercel's headers", () => {
    expect(placeFromHeaders(toronto)).toEqual({
      name: "Toronto, ON",
      latitude: 43.6532,
      longitude: -79.3832,
      timeZone: "America/Toronto",
      country: "CA",
    });
    expect(placeFromHeaders(new Headers())).toBeNull();
    expect(
      placeFromHeaders(
        new Headers({
          "x-vercel-ip-city": "S%C3%A3o%20Paulo",
          "x-vercel-ip-latitude": "-23.5",
          "x-vercel-ip-longitude": "-46.6",
          "x-vercel-ip-timezone": "America/Sao_Paulo",
          "x-vercel-ip-country": "BR",
        }),
      )?.name,
    ).toBe("São Paulo, BR");
  });

  it("moves the starter's weather, clock and date, and only an unsaved starter", () => {
    const starter = freeDefaultConfig();
    expect(untouchedStarter(starter, 0)).toBe(true);
    expect(untouchedStarter(starter, 1)).toBe(false);
    const next = localise(starter, placeFromHeaders(toronto)!)!;
    expect(next.location).toMatchObject({ name: "Toronto, ON", timeZone: "America/Toronto" });
    expect(next.units).toBe("metric");
    const clock = next.views[0]!.widgets.find((w) => w.type === "clock");
    expect(clock).toMatchObject({ timeZone: "America/Toronto", label: "Toronto" });
    expect(untouchedStarter(next, 0)).toBe(false);
  });

  it("switches U.S. households to Fahrenheit", () => {
    const seattle = new Headers({
      "x-vercel-ip-city": "Seattle",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "WA",
      "x-vercel-ip-latitude": "47.6",
      "x-vercel-ip-longitude": "-122.3",
      "x-vercel-ip-timezone": "America/Los_Angeles",
    });
    expect(localise(freeDefaultConfig(), placeFromHeaders(seattle)!)!.units).toBe("imperial");
  });
});
