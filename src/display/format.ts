import { zonedFormatter, type ZonedFormatter } from "@/lib/timeZone";

// Intl formatters are slow to build, so zonedFormatter caches the underlying native formatters.
const cache = new Map<string, ZonedFormatter>();
export function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions): ZonedFormatter {
  const key = timeZone + JSON.stringify(opts);
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = zonedFormatter(timeZone, opts);
    cache.set(key, formatter);
  }
  return formatter;
}

export interface ClockParts {
  hm: string;
  seconds: string;
  ampm: string;
  hours: number;
  minutes: number;
  secs: number;
}

export function clockParts(now: Date, timeZone: string, hour12: boolean): ClockParts {
  const parts = fmt(timeZone, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12 }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const h24 = Number(fmt(timeZone, { hour: "numeric", hourCycle: "h23" }).format(now));
  return {
    hm: `${get("hour")}:${get("minute")}`,
    seconds: get("second"),
    ampm: get("dayPeriod").replace(/\./g, "").toUpperCase(),
    hours: h24,
    minutes: Number(get("minute")),
    secs: Number(get("second")),
  };
}

/** YYYY-MM-DD in a zone. */
export const isoDate = (now: Date, timeZone: string) => fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function weekday(date: string, style: "short" | "long" = "short"): string {
  return fmt("UTC", { weekday: style }).format(new Date(`${date}T12:00:00Z`));
}

export function shortTime(isoLocal: string, hour12: boolean): string {
  const [, t = "00:00"] = isoLocal.split("T");
  const [hs = "0", ms = "00"] = t.split(":");
  const h = Number(hs);
  if (!hour12) return `${String(h).padStart(2, "0")}:${ms}`;
  const h12 = h % 12 || 12;
  return ms === "00" ? `${h12} ${h < 12 ? "AM" : "PM"}` : `${h12}:${ms} ${h < 12 ? "AM" : "PM"}`;
}
