// The moon's phase, worked out on the device with no feed (Melvin, 2026-11-25: "tides, moon phases"). New and full
// moons come from Meeus, Astronomical Algorithms ch. 49 (the terms above 0.0001 day), good to a minute or two, so the
// "next full moon" date is right even when it falls near midnight. Between them the phase is the fraction of the way
// from one true new moon to the next, scaled so the full moon sits exactly at one half. Imported by the display, so
// no dependencies.

const DAY = 86_400_000;
const SYNODIC = 29.530588861;
const RAD = Math.PI / 180;
/** Terrestrial Time runs about 69 s ahead of UTC in the 2020s; close enough for a date on the wall. */
const DELTA_T_MS = 69_000;

function jdeToMs(jde: number): number {
  return (jde - 2440587.5) * DAY - DELTA_T_MS;
}

/** The true new moon (kind 0) or full moon (kind 0.5) of lunation k, counted from the new moon of 6 January 2000. */
function truePhase(k: number, kind: 0 | 0.5): number {
  const kk = Math.floor(k) + kind;
  const T = kk / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  let jde = 2451550.09766 + SYNODIC * kk + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = (2.5534 + 29.1053567 * kk - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
  const Mp = (201.5643 + 385.81693528 * kk + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
  const F = (160.7108 + 390.67050284 * kk - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
  const O = (124.7746 - 1.56375588 * kk + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
  const full = kind === 0.5;
  jde +=
    (full ? -0.40614 : -0.4072) * Math.sin(Mp) +
    (full ? 0.17302 : 0.17241) * E * Math.sin(M) +
    (full ? 0.01614 : 0.01608) * Math.sin(2 * Mp) +
    (full ? 0.01043 : 0.01039) * Math.sin(2 * F) +
    (full ? 0.00734 : 0.00739) * E * Math.sin(Mp - M) -
    (full ? 0.00515 : 0.00514) * E * Math.sin(Mp + M) +
    (full ? 0.00209 : 0.00208) * E * E * Math.sin(2 * M) -
    0.00111 * Math.sin(Mp - 2 * F) -
    0.00057 * Math.sin(Mp + 2 * F) +
    0.00056 * E * Math.sin(2 * Mp + M) -
    0.00042 * Math.sin(3 * Mp) +
    0.00042 * E * Math.sin(M + 2 * F) +
    0.00038 * E * Math.sin(M - 2 * F) -
    0.00024 * E * Math.sin(2 * Mp - M) -
    0.00017 * Math.sin(O);
  return jdeToMs(jde);
}

export const newMoonAt = (k: number) => truePhase(k, 0);
export const fullMoonAt = (k: number) => truePhase(k, 0.5);

/** The lunation whose new moon is the last one at or before `now`. */
function lunation(now: number): number {
  let k = Math.floor((now - newMoonAt(0)) / (SYNODIC * DAY));
  while (newMoonAt(k) > now) k--;
  while (newMoonAt(k + 1) <= now) k++;
  return k;
}

export type MoonPhaseName =
  "New moon" | "Waxing crescent" | "First quarter" | "Waxing gibbous" | "Full moon" | "Waning gibbous" | "Last quarter" | "Waning crescent";

const NAMES: MoonPhaseName[] = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];
// As seen from the northern hemisphere: lit on the right while waxing.
const EMOJI = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

export interface MoonPhase {
  /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  /** Fraction of the disc that is lit, 0 to 1. */
  illumination: number;
  name: MoonPhaseName;
  emoji: string;
  /** Days since the last new moon. */
  age: number;
  nextFull: number;
  nextNew: number;
}

export function moonPhase(now: number): MoonPhase {
  const k = lunation(now);
  const lastNew = newMoonAt(k);
  const full = fullMoonAt(k);
  const nextNew = newMoonAt(k + 1);
  const phase = now < full ? (0.5 * (now - lastNew)) / (full - lastNew) : 0.5 + (0.5 * (now - full)) / (nextNew - full);
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  // New, quarter and full are instants; each names the day or so around it (0.034 of the cycle is about a day).
  const nearest = Math.round(phase * 4) % 4;
  const slot = Math.abs(phase * 4 - Math.round(phase * 4)) < 0.136 ? nearest * 2 : Math.floor(phase * 4) * 2 + 1;
  return {
    phase,
    illumination,
    name: NAMES[slot]!,
    emoji: EMOJI[slot]!,
    age: (now - lastNew) / DAY,
    nextFull: full > now ? full : fullMoonAt(k + 1),
    nextNew,
  };
}

const MONTH_NAMES = [
  "Wolf Moon",
  "Snow Moon",
  "Worm Moon",
  "Pink Moon",
  "Flower Moon",
  "Strawberry Moon",
  "Buck Moon",
  "Sturgeon Moon",
  "Corn Moon",
  "Hunter's Moon",
  "Beaver Moon",
  "Cold Moon",
];

/**
 * The traditional name of the full moon at `at` (the Old Farmer's Almanac's list, by the month it falls in in
 * `timeZone`). The Harvest Moon is the full moon nearest the September equinox, and the one after it is the Hunter's
 * Moon, so in some years those two land in October and November.
 */
export function fullMoonName(at: number, monthOf: (ms: number) => number): string {
  const year = new Date(at).getUTCFullYear();
  const equinox = Date.UTC(year, 8, 22, 18);
  const k = lunation(equinox);
  const fulls = [k - 1, k, k + 1].map(fullMoonAt);
  const harvestK = k - 1 + fulls.indexOf(fulls.reduce((a, b) => (Math.abs(b - equinox) < Math.abs(a - equinox) ? b : a)));
  if (Math.abs(at - fullMoonAt(harvestK)) < DAY * 2) return "Harvest Moon";
  if (Math.abs(at - fullMoonAt(harvestK + 1)) < DAY * 2) return "Hunter's Moon";
  const month = monthOf(at);
  return MONTH_NAMES[month] ?? "Full Moon";
}

/** SVG path data for the lit part of a moon disc of radius r centred on (r, r), lit on the right while waxing. */
export function moonPath(phase: number, r: number): string {
  const waxing = phase < 0.5;
  const rx = Math.abs(Math.cos(2 * Math.PI * phase)) * r;
  const crescent = phase < 0.25 || phase > 0.75;
  const top = `${r} 0`;
  const bottom = `${r} ${2 * r}`;
  const f = (n: number) => Math.round(n * 100) / 100;
  // The lit limb is a half circle on the lit side; the terminator is half an ellipse back to the top, bowing towards
  // the lit side for a crescent and away from it for a gibbous moon. In SVG's y-down space sweep 1 is clockwise.
  if (waxing) return `M${top}A${r} ${r} 0 0 1 ${bottom}A${f(rx)} ${r} 0 0 ${crescent ? 0 : 1} ${top}Z`;
  return `M${top}A${r} ${r} 0 0 0 ${bottom}A${f(rx)} ${r} 0 0 ${crescent ? 1 : 0} ${top}Z`;
}
