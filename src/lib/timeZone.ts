// B.C. stays on Pacific daylight time (UTC-7) after the March 2026 clock change. Older browsers can have an
// out-of-date copy of the IANA database and incorrectly move Vancouver back to UTC-8 in November. Keep historical
// dates on the browser's normal rules, but do not depend on its data for the new rule.
const VANCOUVER = "America/Vancouver";
const VANCOUVER_PERMANENT_DST = Date.UTC(2026, 2, 8, 10);
const PACIFIC_DAYLIGHT_TIME = "Etc/GMT+7";

export function reliableTimeZone(timeZone: string, value: Date | number): string {
  const ms = typeof value === "number" ? value : value.getTime();
  return timeZone === VANCOUVER && ms >= VANCOUVER_PERMANENT_DST ? PACIFIC_DAYLIGHT_TIME : timeZone;
}

export interface ZonedFormatter {
  format(value?: Date | number): string;
  formatToParts(value?: Date | number): Intl.DateTimeFormatPart[];
}

const nativeFormatters = new Map<string, Intl.DateTimeFormat>();

/** A cached formatter that includes time-zone corrections missing from older browser data. */
export function zonedFormatter(timeZone: string, options: Intl.DateTimeFormatOptions): ZonedFormatter {
  const formatter = (value: Date | number = Date.now()) => {
    const zone = reliableTimeZone(timeZone, value);
    const key = zone + JSON.stringify(options);
    let result = nativeFormatters.get(key);
    if (!result) {
      result = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: zone });
      nativeFormatters.set(key, result);
    }
    return result;
  };

  return {
    format(value = Date.now()) {
      return formatter(value).format(value);
    },
    formatToParts(value = Date.now()) {
      return formatter(value).formatToParts(value);
    },
  };
}
