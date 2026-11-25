import { describe, expect, it } from "vitest";

import { CSP } from "./securityHeaders";
import { windyPressureAllowed, windyUrl } from "./windy";

const langley = {
  overlay: "radar" as const,
  zoom: 8,
  latitude: 49.1044,
  longitude: -122.6604,
  marker: true,
  pressure: false,
  units: "metric" as const,
};

describe("Windy map address", () => {
  it("points Windy's embed at home on the chosen layer, in metric, without the promotional line", () => {
    const url = new URL(windyUrl(langley));
    expect(url.origin + url.pathname).toBe("https://embed.windy.com/embed.html");
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      overlay: "radar",
      zoom: "8",
      lat: "49.1",
      lon: "-122.66",
      detailLat: "49.1",
      detailLon: "-122.66",
      marker: "true",
      message: "",
      pressure: "",
      metricTemp: "°C",
      metricWind: "km/h",
      metricRain: "mm",
      product: "ecmwf",
    });
  });

  it("uses imperial units, pressure lines where they can be drawn, and the air-quality model for PM2.5", () => {
    const q = new URL(windyUrl({ ...langley, overlay: "wind", pressure: true, marker: false, units: "imperial" })).searchParams;
    expect([q.get("metricTemp"), q.get("metricWind"), q.get("metricRain")]).toEqual(["°F", "mph", "in"]);
    expect(q.get("pressure")).toBe("true");
    expect(q.get("marker")).toBe("");
    expect(new URL(windyUrl({ ...langley, pressure: true })).searchParams.get("pressure")).toBe("");
    expect(new URL(windyUrl({ ...langley, overlay: "pm2p5" })).searchParams.get("product")).toBe("cams");
    expect(windyPressureAllowed("satellite")).toBe(false);
  });

  it("may be framed by the display", () => {
    expect(CSP).toContain("https://embed.windy.com");
  });
});
