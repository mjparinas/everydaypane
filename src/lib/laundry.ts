// Washer and dryer status (Melvin, 2026-11-25: "build that all", washer and dryer done alerts among them). Native cloud
// APIs only, not Home Assistant: LG ThinQ Connect with a personal access token, and Samsung machines through the
// SmartThings connection the household already has. Shared by the server's feed and tests; the display gets plain
// states and never imports this file.

export type LaundryKind = "washer" | "dryer" | "combo";
/** What the wall shows. `done` lasts from the end of a cycle until the next one starts or `doneMinutes` pass. */
export type LaundryState = "running" | "paused" | "done" | "idle" | "off" | "error";

/** One machine as a provider reports it, before the server works out "done" (src/server/laundry.ts). */
export interface LaundryReading {
  id: string;
  name: string;
  kind: LaundryKind;
  source: "lg" | "smartthings";
  /** The provider's own view: `done` only when it says the cycle has ended (LG END, SmartThings finish). */
  state: LaundryState;
  /** A short phase, already in words ("Rinsing"), when the machine says. */
  phase?: string;
  /** Minutes left in the cycle, when known. */
  remainingMin?: number;
  /** Whole cycle length in minutes, for a progress bar. */
  totalMin?: number;
  /** Epoch ms the cycle should end, when the provider sends a time rather than minutes. */
  endsAt?: number;
}

const words = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");

// ---- LG ThinQ Connect: `runState.currentState` (thinq.developer.lge.com device profiles, read 2026-11-25). ----

const LG_PHASES: Record<string, string> = {
  DETECTING: "Sensing Load",
  SOAKING: "Soaking",
  PREWASH: "Prewash",
  RUNNING: "Washing",
  RINSING: "Rinsing",
  SPINNING: "Spinning",
  DRYING: "Drying",
  COOLING: "Cooling",
  COOL_DOWN: "Cooling",
  STEAM_SOFTENING: "Steam",
  REFRESHING: "Refreshing",
  WRINKLE_CARE: "Wrinkle Care",
  RINSE_HOLD: "Rinse Hold",
  ADD_DRAIN: "Draining",
  DISPENSING: "Dispensing",
  SOFTENING: "Softening",
};

/** LG's run state to ours. Anything unknown while the machine is on counts as running, since LG keeps adding phases. */
export function lgState(current: string | undefined): { state: LaundryState; phase?: string } {
  const s = (current ?? "").toUpperCase();
  switch (s) {
    case "":
    case "POWER_OFF":
    case "SLEEP":
      return { state: "off" };
    case "INITIAL":
    case "DISPLAY_LOADSIZE":
    case "FIRMWARE":
    case "RESERVED":
      return { state: "idle" };
    case "PAUSE":
    case "FROZEN_PREVENT_PAUSE":
      return { state: "paused" };
    case "END":
      return { state: "done" };
    case "ERROR":
      return { state: "error" };
    default: {
      const phase = LG_PHASES[s];
      return { state: "running", phase: phase ?? (s.startsWith("FROZEN_PREVENT") ? "Freeze Guard" : words(s)) };
    }
  }
}

export const LG_LAUNDRY_TYPES: Record<string, LaundryKind> = {
  DEVICE_WASHER: "washer",
  DEVICE_DRYER: "dryer",
  DEVICE_WASHTOWER_WASHER: "washer",
  DEVICE_WASHTOWER_DRYER: "dryer",
  DEVICE_WASHTOWER: "washer",
  DEVICE_WASHCOMBO_MAIN: "combo",
  DEVICE_WASHCOMBO_MINI: "washer",
  DEVICE_STYLER: "dryer",
};

/**
 * LG countries by region (pythinqconnect `country.py`): the Americas use api-aic, Europe, the Middle East and Africa
 * api-eic, everywhere else api-kic. Only the Americas and Europe need listing.
 */
const AIC = "AG AR AW BB BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN HT JM KN LC MX NI PA PE PR PY SR SV TT US UY VC VE";
const EIC =
  "AD AE AL AM AO AT AZ BA BE BF BG BH BJ BY CD CF CG CH CI CM CV CY CZ DE DJ DK DZ EE EG ES ET FI FR GA GB GE GH GM GN GQ GR HR HU IE IL IQ IR IS IT JO KE KW KZ LB LI LR LT LU LV LY MA MC MD ME MK ML MR MT MW NE NG NL NO OM PL PS PT QA RO RS RU RW SA SD SE SI SK SL SN SO ST SY TD TG TN TR TZ UA UG UZ YE ZA ZM ZW";

export function lgRegion(country: string): "aic" | "eic" | "kic" {
  const c = country.toUpperCase();
  if (AIC.split(" ").includes(c)) return "aic";
  if (EIC.split(" ").includes(c)) return "eic";
  return "kic";
}

// ---- SmartThings (Samsung): washerOperatingState / dryerOperatingState and the samsungce.* versions. ----

const ST_JOBS: Record<string, string> = {
  weightSensing: "Sensing Load",
  preWash: "Prewash",
  wash: "Washing",
  aIWash: "Washing",
  airWash: "Air Wash",
  rinse: "Rinsing",
  aIRinse: "Rinsing",
  spin: "Spinning",
  aISpin: "Spinning",
  drying: "Drying",
  aIDrying: "Drying",
  cooling: "Cooling",
  wrinklePrevent: "Wrinkle Care",
  refreshing: "Refreshing",
  sanitizing: "Sanitizing",
  delayWash: "Delayed Start",
};

/**
 * SmartThings' machine state (`run`, `pause`, `stop`, or samsungce `running`, `paused`, `ready`) and job state to ours.
 * A `finish`/`finished` job is done; a stopped machine is idle, and the server turns a run that stops into done.
 */
export function stState(
  machine: string | undefined,
  job: string | undefined,
  power: string | undefined,
): { state: LaundryState; phase?: string } {
  const m = (machine ?? "").toLowerCase();
  const j = job ?? "";
  if (j === "finish" || j === "finished") return { state: "done" };
  if (m === "run" || m === "running")
    return { state: "running", ...(ST_JOBS[j] ? { phase: ST_JOBS[j] } : j && j !== "none" ? { phase: words(j) } : {}) };
  if (m === "pause" || m === "paused") return { state: "paused" };
  if (power === "off") return { state: "off" };
  return { state: "idle" };
}

/** How long a finished load shows as done when nobody starts the next one. */
export const DONE_MINUTES_DEFAULT = 180;
