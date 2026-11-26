import type { PackageCarrier, PackageStatus, PackageTrack } from "@/lib/display/types";
import { zonedFormatter, type ZonedFormatter } from "@/lib/timeZone";

// Package tracking rules shared by the server (17TRACK's answers) and the wall (what counts as "today", the order).
// 17TRACK was Claude's pick (2026-11-26): one key covers Canada Post, Purolator, UPS, FedEx, DHL and USPS and works
// out the carrier from the number, where carrier APIs each need their own business account (Canada Post's needs a
// customer number, Purolator's an account), and AfterShip's tracking API is paid-only.

export const CARRIER_NAMES: Record<PackageCarrier, string> = {
  ups: "UPS",
  fedex: "FedEx",
  canadaPost: "Canada Post",
  purolator: "Purolator",
  dhl: "DHL",
  usps: "USPS",
  other: "",
};

/**
 * 17TRACK's own carrier numbers, from its carrier list. A number picked by hand is sent with its carrier so a 22-digit
 * USPS number isn't mistaken for another; "other" and carriers not listed here are left to 17TRACK to work out, and a
 * register refused with a carrier is tried again without one (src/server/packages.ts).
 */
export const CARRIER_17TRACK: Partial<Record<PackageCarrier, number>> = {
  dhl: 100001,
  ups: 100002,
  fedex: 100003,
  usps: 21051,
  canadaPost: 3041,
};

/** 17TRACK's `latest_status.status` words. Anything else is "unknown". */
export function statusFrom17(status: unknown): PackageStatus {
  switch (status) {
    case "InfoReceived":
      return "preTransit";
    case "InTransit":
      return "inTransit";
    case "OutForDelivery":
      return "outForDelivery";
    case "AvailableForPickup":
      return "pickup";
    case "Delivered":
      return "delivered";
    case "DeliveryFailure":
    case "Exception":
      return "exception";
    default:
      return "unknown";
  }
}

/**
 * A time from 17TRACK in ms. A date with no time ("2026-11-27") is read as noon UTC, so it lands on that same date
 * anywhere in the Americas and Europe instead of the evening before in Vancouver.
 */
export function timeFrom17(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.trim();
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
  return Number.isFinite(ms) ? ms : undefined;
}

const days = new Map<string, ZonedFormatter>();
/** The calendar day of a time in a zone, as YYYY-MM-DD (B.C.'s permanent UTC−7 even on old time-zone data). */
export function dayIn(ms: number, timeZone: string): string {
  let f = days.get(timeZone);
  if (!f) days.set(timeZone, (f = zonedFormatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" })));
  return f.format(ms);
}

export type PackageWhen = "today" | "later" | "late" | "none";

/** Whether the carrier expects it today, on a later day, or by a day that has passed. */
export function etaWhen(p: Pick<PackageTrack, "etaFrom" | "etaTo">, now: number, timeZone: string): PackageWhen {
  const from = p.etaFrom ?? p.etaTo;
  if (from === undefined) return "none";
  const to = p.etaTo ?? from;
  const today = dayIn(now, timeZone);
  const a = dayIn(from, timeZone);
  const b = dayIn(to, timeZone);
  if (a <= today && today <= b) return "today";
  return b < today ? "late" : "later";
}

/** Out for delivery, ready for pickup, expected today, or delivered today: what "today" shows. */
export function isToday(p: PackageTrack, now: number, timeZone: string): boolean {
  if (p.status === "outForDelivery" || p.status === "pickup") return true;
  if (p.status === "delivered") return p.deliveredAt !== undefined && dayIn(p.deliveredAt, timeZone) === dayIn(now, timeZone);
  return etaWhen(p, now, timeZone) === "today";
}

/** Delivered today stays on the wall; one delivered on an earlier day only shows with "Show Delivered". */
export function deliveredEarlier(p: PackageTrack, now: number, timeZone: string): boolean {
  return p.status === "delivered" && !(p.deliveredAt !== undefined && dayIn(p.deliveredAt, timeZone) === dayIn(now, timeZone));
}

const RANK: Record<PackageStatus, number> = {
  outForDelivery: 0,
  pickup: 1,
  exception: 2,
  inTransit: 3,
  preTransit: 4,
  unknown: 5,
  delivered: 6,
};

/** Today's first (out for delivery, then pickup), then problems, then by expected day; delivered last. */
export function sortPackages(list: PackageTrack[], now: number, timeZone: string): PackageTrack[] {
  const key = (p: PackageTrack) => {
    const today = p.status !== "delivered" && isToday(p, now, timeZone);
    return [today ? 0 : 1, RANK[p.status], p.etaFrom ?? p.etaTo ?? Number.MAX_SAFE_INTEGER] as const;
  };
  return list
    .map((p, i) => ({ p, i, k: key(p) }))
    .sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2] || x.i - y.i)
    .map((x) => x.p);
}
