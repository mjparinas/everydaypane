// Colour arithmetic for direct colour lights (Philips Hue and LIFX, Melvin, 2026-11-25). The wall's swatches speak
// #rrggbb (as Govee does); Hue speaks CIE xy and LIFX hue and saturation, so the server converts both ways here.

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function hexColour(r: number, g: number, b: number): string {
  const part = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** An RGB number (0 to 0xffffff) as 0..1 channels. */
export function rgbChannels(rgb: number): [number, number, number] {
  return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255];
}

// sRGB gamma, both ways (the formulas in Philips Hue's own RGB to xy notes).
const toLinear = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** An RGB number as CIE xy for Hue. Black has no chromaticity, so it comes out as white's point. */
export function rgbToXy(rgb: number): { x: number; y: number } {
  const [r, g, b] = rgbChannels(rgb).map(toLinear) as [number, number, number];
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const sum = X + Y + Z;
  if (sum <= 0) return { x: 0.3127, y: 0.329 };
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return { x: round(X / sum), y: round(Y / sum) };
}

/** CIE xy (as Hue reports it) at full brightness, as #rrggbb for the wall's swatches. */
export function xyToHex(x: number, y: number): string {
  if (!(y > 0) || !Number.isFinite(x)) return "#ffffff";
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
  let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
  let b = X * 0.0557 - Y * 0.204 + Z * 1.057;
  // Scale so the strongest channel is full, then clip what is out of sRGB.
  const max = Math.max(r, g, b);
  if (max > 0) [r, g, b] = [r / max, g / max, b / max];
  return hexColour(toGamma(clamp01(r)), toGamma(clamp01(g)), toGamma(clamp01(b)));
}

/** Hue (0–360) and saturation (0–1), as LIFX reports them, at full brightness, as #rrggbb. */
export function hsvToHex(hue: number, saturation: number): string {
  const h = ((((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360) / 60;
  const s = clamp01(Number.isFinite(saturation) ? saturation : 0);
  const c = s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = 1 - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return hexColour(r + m, g + m, b + m);
}
