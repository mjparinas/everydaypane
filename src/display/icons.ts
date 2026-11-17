// Weather icons for WMO weather codes (what Open-Meteo returns), as small inline SVG so they cost no requests.
// Colours come from CSS variables (--sun, --cloud, --cloud-shade, --rain, --snow, --bolt) so day and night themes
// can tune them.

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const [x1, y1, x2, y2] = [32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18, 32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25].map((n) =>
    n.toFixed(1),
  );
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}).join("");

const sun = (s = 1, dx = 0, dy = 0) =>
  `<g transform="translate(${dx} ${dy}) scale(${s})" transform-origin="32 32"><g stroke="var(--sun)" stroke-width="4" stroke-linecap="round">${SUN_RAYS}</g><circle cx="32" cy="32" r="12" fill="var(--sun)"/></g>`;
const moon = (s = 1, dx = 0, dy = 0) =>
  `<g transform="translate(${dx} ${dy}) scale(${s})" transform-origin="32 32"><path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12z" fill="var(--moon)"/></g>`;
const cloud = (dy = 0) =>
  `<g transform="translate(0 ${dy})"><path d="M20 50h26a11 11 0 0 0 1-22 15 15 0 0 0-28.5 4A9 9 0 0 0 20 50z" fill="var(--cloud)"/><path d="M20 50h26a11 11 0 0 0 10.4-7.4A11 11 0 0 1 46 47H21a9 9 0 0 1-8.6-6.4A9 9 0 0 0 20 50z" fill="var(--cloud-shade)"/></g>`;
const drops = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<line x1="${22 + i * 9}" y1="54" x2="${19 + i * 9}" y2="61" stroke="var(--rain)" stroke-width="3.5" stroke-linecap="round"/>`,
  ).join("");
const flakes = (n: number) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${22 + i * 9}" cy="${57 + (i % 2) * 3}" r="2.6" fill="var(--snow)"/>`).join("");
const bolt = `<path d="M34 46l-7 10h6l-3 8 10-12h-6l3-6z" fill="var(--bolt)"/>`;
const fog = `<g stroke="var(--cloud-shade)" stroke-width="4" stroke-linecap="round"><line x1="12" y1="48" x2="52" y2="48"/><line x1="16" y1="56" x2="48" y2="56"/></g>`;

const wrap = (body: string) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "heavyRain" | "freezing" | "snow" | "thunder";

export function kindOf(code: number): WeatherKind {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "freezing";
  if (code === 61 || code === 63 || code === 80 || code === 81) return "rain";
  if (code === 65 || code === 82) return "heavyRain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

export const LABELS: Record<WeatherKind, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  heavyRain: "Heavy rain",
  freezing: "Freezing rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};

export function label(code: number, isDay = true): string {
  const k = kindOf(code);
  if (k === "clear") return code === 1 ? "Mainly clear" : isDay ? "Sunny" : "Clear";
  return LABELS[k];
}

export function weatherIcon(code: number, isDay = true): string {
  const sky = (s: number, dx: number, dy: number) => (isDay ? sun(s, dx, dy) : moon(s, dx, dy));
  switch (kindOf(code)) {
    case "clear":
      return wrap(isDay ? sun() : moon());
    case "partly":
      return wrap(sky(0.75, 9, -9) + cloud(2));
    case "cloudy":
      return wrap(cloud(-2));
    case "fog":
      return wrap(cloud(-8) + fog);
    case "drizzle":
      return wrap(cloud(-6) + drops(2));
    case "rain":
      return wrap(cloud(-6) + drops(3));
    case "heavyRain":
      return wrap(cloud(-6) + drops(4));
    case "freezing":
      return wrap(cloud(-6) + drops(2) + flakes(1).replace('cx="22"', 'cx="40"'));
    case "snow":
      return wrap(cloud(-6) + flakes(4));
    case "thunder":
      return wrap(cloud(-8) + bolt + drops(1));
  }
}
