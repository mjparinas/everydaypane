import { describe, expect, it } from "vitest";

import { alertSourceLabels, regionAt, regionOf, REGIONS } from "./regions";

describe("regional packs", () => {
  it("places major cities in the right pack", () => {
    const cases: [string, number, number, string][] = [
      ["Langley", 49.1044, -122.6604, "lowerMainland"],
      ["Vancouver", 49.2827, -123.1207, "lowerMainland"],
      ["Chilliwack", 49.1579, -121.9515, "lowerMainland"],
      ["Victoria", 48.4284, -123.3656, "bc"],
      ["Kelowna", 49.888, -119.496, "bc"],
      ["Prince George", 53.917, -122.749, "bc"],
      ["Calgary", 51.0447, -114.0719, "calgary"],
      ["Banff", 51.178, -115.571, "canada"],
      ["Edmonton", 53.5461, -113.4938, "edmonton"],
      ["Toronto", 43.6532, -79.3832, "toronto"],
      ["Ottawa", 45.4215, -75.6972, "canada"],
      ["Gatineau", 45.4765, -75.7013, "quebec"],
      ["Montréal", 45.5019, -73.5674, "quebec"],
      ["Québec City", 46.8139, -71.208, "quebec"],
      ["Halifax", 44.6488, -63.5752, "halifax"],
      ["Winnipeg", 49.8951, -97.1384, "canada"],
      ["Seattle", 47.6062, -122.3321, "seattle"],
      ["Bellingham", 48.7519, -122.4787, "us"],
      ["Blaine", 48.9937, -122.7471, "us"],
      ["Point Roberts", 48.985, -123.07, "us"],
      ["Buffalo", 42.8864, -78.8784, "us"],
      ["Detroit", 42.36, -83.1, "us"],
      ["Portland", 45.5152, -122.6784, "us"],
      ["Anchorage", 61.2181, -149.9003, "us"],
      ["Honolulu", 21.3069, -157.8583, "us"],
      ["Tijuana", 32.5149, -117.0382, "other"],
      ["London", 51.5072, -0.1276, "other"],
    ];
    for (const [name, lat, lon, id] of cases) expect([name, regionAt(lat, lon)]).toEqual([name, id]);
    expect(regionAt(NaN, 0)).toBe("other");
  });

  it("lets Settings override the location", () => {
    const location = { latitude: 49.1044, longitude: -122.6604 };
    expect(regionOf({ location }).id).toBe("lowerMainland");
    expect(regionOf({ region: "auto", location }).id).toBe("lowerMainland");
    expect(regionOf({ region: "seattle", location }).id).toBe("seattle");
  });

  it("names each alert source for the region, and hides the ones nothing feeds", () => {
    expect(alertSourceLabels(REGIONS.lowerMainland)).toEqual({
      alertReady: "Alert Ready (public emergencies)",
      weather: "Environment Canada weather warnings",
      roads: "DriveBC road events",
      earthquakes: "Earthquakes (Earthquakes Canada)",
      power: "BC Hydro power outages",
      evacuations: "Evacuation orders and alerts (EmergencyInfoBC)",
    });
    expect(alertSourceLabels(REGIONS.seattle)).toMatchObject({
      alertReady: null,
      weather: "National Weather Service watches and warnings",
      roads: null,
      power: null,
      earthquakes: "Earthquakes (USGS)",
    });
    expect(alertSourceLabels(REGIONS.quebec).power).toBe("Hydro-Québec power outages");
    expect(alertSourceLabels(REGIONS.other).weather).toBeNull();
  });
});
