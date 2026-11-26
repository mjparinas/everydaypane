import "server-only";

import type { OnThisDayData, OnThisDayItem } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// "On this day" (Melvin, 2026-11-25) from Wikipedia's featured feed, the list its own Main Page uses
// (en.wikipedia.org/api/rest_v1/feed/onthisday/<selected|births>/MM/DD, no key). Wikipedia asks API clients to name
// themselves with a way to reach them, so the User-Agent carries the site's address. One read per day and kind, kept
// 12 hours, serves every household.
//
// The kitchen wall is read by kids, and the day's history is often wars and disasters, so the family-friendly filter
// (on by default) drops any item that mentions one. It is a word list, so it errs on dropping things; when it drops
// everything the widget shows the births instead of nothing (the route asks for both).

const BASE = "https://en.wikipedia.org/api/rest_v1/feed/onthisday";
const TTL = 12 * 3_600_000;
const UA = "Everydaypane/1.0 (https://www.everydaypane.com; wall dashboard)";

const GRIM =
  /\b(kill(s|ed|ing)?|dead|death(s)?|die(s|d)?|dying|murder\w*|massacre\w*|genocide|holocaust|war(s|time)?|battle\w*|invasion|invade\w*|bomb\w*|terror\w*|attack\w*|shoot\w*|shot|assassinat\w*|execut\w*|hang(ed|ing)|crash\w*|disaster\w*|earthquake\w*|tsunami\w*|famine|epidemic|pandemic|plague|suicide|rape\w*|abuse\w*|slave\w*|riot\w*|coup|hostage\w*|explosion\w*|explode\w*|sinks?|sank|sunk|wreck\w*|fire(s)?|burn(s|ed|ing)?|victims?|casualt\w*|fatal\w*|injur\w*|nazi\w*|weapons?|nuclear test\w*|missile\w*|troops|soldiers?|army|military|surrender\w*|siege|kidnap\w*|crime\w*|prison\w*|arrest\w*|torture\w*|lynch\w*)\b/i;

export function familyFriendly(text: string): boolean {
  return !GRIM.test(text);
}

export function parseOnThisDay(raw: unknown, kind: "events" | "births"): OnThisDayItem[] {
  const list = (raw as Record<string, unknown> | null)?.[kind === "births" ? "births" : "selected"];
  if (!Array.isArray(list)) return [];
  const out: OnThisDayItem[] = [];
  for (const e of list as { text?: unknown; year?: unknown }[]) {
    const year = Number(e?.year);
    const text = typeof e?.text === "string" ? e.text.replace(/\s+/g, " ").trim() : "";
    if (!Number.isInteger(year) || !text) continue;
    out.push({ year, text: text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text });
  }
  return out;
}

/** A stable shuffle for the day: the same order on every screen and every reload, a different one tomorrow. */
export function dayOrder<T>(items: T[], date: string): T[] {
  let seed = 0;
  for (const c of date) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function day(date: string, kind: "events" | "births"): Promise<{ items: OnThisDayItem[]; fetchedAt: number; stale: boolean }> {
  const [, mm, dd] = date.split("-");
  const path = kind === "births" ? "births" : "selected";
  const { value, fetchedAt, stale } = await cached(`onthisday:${path}:${mm}-${dd}`, TTL, async () =>
    parseOnThisDay(
      await getJson(`${BASE}/${path}/${mm}/${dd}`, { headers: { Accept: "application/json", "User-Agent": UA } }, 10_000),
      kind,
    ),
  );
  return { items: value, fetchedAt, stale };
}

export async function onThisDayFeed(date: string, kind: "events" | "births", safe: boolean): Promise<OnThisDayData> {
  try {
    const first = await day(date, kind);
    let items = safe ? first.items.filter((i) => familyFriendly(i.text)) : first.items;
    if (!items.length && kind === "events") items = (await day(date, "births")).items.filter((i) => !safe || familyFriendly(i.text));
    return { updatedAt: first.fetchedAt, stale: first.stale, date, items: dayOrder(items, date).slice(0, 5) };
  } catch (error) {
    console.error("[on this day]", error);
    return { updatedAt: Date.now(), date, items: [], error: "Wikipedia isn't answering right now" };
  }
}
