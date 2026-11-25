// Windy weather map (Melvin, 2026-11-21: "do windy"). Windy's free embed (embed.windy.com) needs no key or sign-up,
// so the widget is just an iframe pointed at it; this file builds its address. Kept free of zod so the display can
// import it. The parameter names are those Windy's own embed configurator (embed.windy.com/config/map) writes.

export const WINDY_OVERLAYS = ["radar", "rain", "wind", "gust", "temp", "clouds", "snowAccu", "thunder", "satellite", "pm2p5"] as const;
export type WindyOverlay = (typeof WINDY_OVERLAYS)[number];

export const WINDY_OVERLAY_LABELS: Record<WindyOverlay, string> = {
  radar: "Radar",
  rain: "Rain and thunder (forecast)",
  wind: "Wind",
  gust: "Wind gusts",
  temp: "Temperature",
  clouds: "Clouds",
  snowAccu: "New snow",
  thunder: "Thunderstorms",
  satellite: "Satellite",
  pm2p5: "Air quality (PM2.5)",
};

/** Pressure lines can't be drawn over the radar or satellite pictures (Windy's configurator says so). */
export const windyPressureAllowed = (overlay: WindyOverlay): boolean => overlay !== "radar" && overlay !== "satellite";

export interface WindyMap {
  overlay: WindyOverlay;
  zoom: number;
  latitude: number;
  longitude: number;
  marker: boolean;
  pressure: boolean;
  units: "metric" | "imperial";
}

// Rounded to two decimals (about a kilometre), as the earth map does: the point is sent to Windy.
const round = (n: number) => String(Math.round(n * 100) / 100);

/** The embed's address. The promotional line is left off (`message` empty) and the marker sits on the map's centre. */
export function windyUrl(m: WindyMap): string {
  const metric = m.units === "metric";
  const q = new URLSearchParams({
    type: "map",
    location: "coordinates",
    metricRain: metric ? "mm" : "in",
    metricTemp: metric ? "°C" : "°F",
    metricWind: metric ? "km/h" : "mph",
    zoom: String(m.zoom),
    overlay: m.overlay,
    product: m.overlay === "pm2p5" ? "cams" : "ecmwf",
    level: "surface",
    lat: round(m.latitude),
    lon: round(m.longitude),
    message: "",
    menu: "",
    calendar: "now",
    pressure: m.pressure && windyPressureAllowed(m.overlay) ? "true" : "",
    marker: m.marker ? "true" : "",
    detailLat: round(m.latitude),
    detailLon: round(m.longitude),
  });
  return `https://embed.windy.com/embed.html?${q.toString()}`;
}
