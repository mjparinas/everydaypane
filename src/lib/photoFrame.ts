import type { PhotoItem } from "@/lib/display/types";

// The photo frame's choices (Melvin, 2026-11-26: "polish the photo frame until it rivals Skylight"), kept here so they
// can be tested without a browser: which photos come up first, which two portraits share a landscape frame, when a
// photo fills the frame and when it is shown whole over a soft copy of itself, and what its caption says.

export type Pick = { source: string; photo: PhotoItem };
export type Orientation = "portrait" | "landscape" | "square" | "unknown";

/** Portrait or landscape once the long side is a tenth longer; sources that don't say a size are "unknown". */
export function orientation(w: number, h: number): Orientation {
  if (!(w > 0 && h > 0)) return "unknown";
  if (h > w * 1.1) return "portrait";
  if (w > h * 1.1) return "landscape";
  return "square";
}

/**
 * "auto" fills the frame when cropping would lose little (the photo's shape within a third of the frame's), and
 * otherwise shows the whole photo over a blurred copy of itself, so a portrait in a landscape frame keeps its faces.
 */
export function fitFor(fit: "cover" | "contain" | "auto", photoAspect: number, frameAspect: number): "cover" | "contain" {
  if (fit !== "auto") return fit;
  if (!(photoAspect > 0 && frameAspect > 0)) return "cover";
  const ratio = photoAspect > frameAspect ? photoAspect / frameAspect : frameAspect / photoAspect;
  return ratio <= 1.34 ? "cover" : "contain";
}

/** Two photos share the frame when both are the other way round from it: two portraits side by side in a landscape frame. */
export function pairs(frame: Orientation, photo: Orientation): boolean {
  return (frame === "landscape" && photo === "portrait") || (frame === "portrait" && photo === "landscape");
}

/** Index of the next eligible partner within the requested lookahead. */
export function partnerIndex(queue: Pick[], frame: Orientation, lookAhead = 12): number {
  for (let i = 0; i < Math.min(queue.length, lookAhead); i++) {
    const p = queue[i]?.photo;
    if (p && pairs(frame, orientation(p[1], p[2]))) return i;
  }
  return -1;
}

/** The year of a photo taken on today's day in an earlier year, else null. Dates are YYYY-MM-DD. */
export function memoryYear(taken: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(taken) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null;
  const year = Number(taken.slice(0, 4));
  return taken.slice(5, 10) === today.slice(5, 10) && year < Number(today.slice(0, 4)) ? year : null;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const pickKey = (p: Pick) => `${p.source}\n${p.photo[0]}`;

export interface CachedPick extends Pick {
  url: string;
}

/**
 * Fallback pool size per source and across the screen (Melvin, 2026-11-27: cache a few photos so a failed load never
 * leaves a blank screen, without loading too many for modest wall hardware).
 */
export const MAX_CACHED_PER_SOURCE = 6;
export const MAX_CACHED_TOTAL = 10;

/** Keeps a loaded photo at the newest end of the fallback list, bounded per source and overall. */
export function rememberCachedPhoto(
  list: CachedPick[],
  entry: CachedPick,
  maxPerSource = MAX_CACHED_PER_SOURCE,
  maxTotal = MAX_CACHED_TOTAL,
): CachedPick[] {
  if (maxPerSource <= 0 || maxTotal <= 0) return [];
  const key = pickKey(entry);
  const rest = list.filter((c) => pickKey(c) !== key);
  let fromSource = 0;
  for (const c of rest) if (c.source === entry.source) fromSource++;
  const pruned =
    fromSource < maxPerSource
      ? rest
      : rest.filter((c) => {
          if (c.source !== entry.source || fromSource < maxPerSource) return true;
          fromSource--;
          return false;
        });
  pruned.push(entry);
  return pruned.length > maxTotal ? pruned.slice(pruned.length - maxTotal) : pruned;
}

/** Picks a random cached photo from the widget's sources, preferring one not already on screen. */
export function pickCachedPhoto(
  list: CachedPick[],
  sources: ReadonlySet<string>,
  avoid: ReadonlySet<string>,
  random = Math.random,
): CachedPick | undefined {
  const matching = list.filter((c) => sources.has(c.source));
  if (!matching.length) return undefined;
  const other = matching.filter((c) => !avoid.has(pickKey(c)));
  const pool = other.length ? other : matching;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * One pass through the deck: photos added since the frame last looked come first (newest family photo up next), then
 * this day in earlier years, then everything else shuffled (Fisher-Yates, a new order every pass and every load).
 * Nothing repeats within a pass. `recent` holds what this screen showed last, newest last, even before a reload
 * (Melvin, 2026-11-27: "in photo mode can you ensure that they are randomly chosen"): the newer half of the deck's
 * worth of those goes to the end of the pass, so a refresh or a new pass never opens on the photo just shown, and an
 * "On this day" photo leads once rather than after every reload. Only half, so a small album still shuffles.
 */
export function order(
  deck: Pick[],
  opts: { today: string; memories: boolean; fresh?: Set<string>; recent?: string[] },
  random = Math.random,
): Pick[] {
  const inDeck = new Set(deck.map(pickKey));
  const recentKeys = (opts.recent ?? []).filter((k) => inDeck.has(k));
  const later = new Set(recentKeys.slice(-Math.floor(deck.length / 2)));
  const fresh: Pick[] = [];
  const memories: Pick[] = [];
  const rest: Pick[] = [];
  const last: Pick[] = [];
  for (const p of deck) {
    const key = pickKey(p);
    if (opts.fresh?.has(key)) fresh.push(p);
    else if (later.has(key)) last.push(p);
    else if (opts.memories && memoryYear(p.photo[3], opts.today) !== null) memories.push(p);
    else rest.push(p);
  }
  return [...fresh, ...shuffle(memories, random), ...shuffle(rest, random), ...shuffle(last, random)];
}

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

/** What the caption says: "On this day · 2019", "Just added", or "November 14, 2023 · 3 years ago". */
export function caption(taken: string, today: string, opts: { memories: boolean; fresh: boolean }): string {
  if (opts.fresh) return "Just added";
  const year = memoryYear(taken, today);
  if (opts.memories && year !== null) {
    const ago = Number(today.slice(0, 4)) - year;
    return `On this day · ${year} · ${ago === 1 ? "a year ago" : `${ago} years ago`}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(taken)) return "";
  const t = Date.parse(`${taken.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return "";
  const date = MONTH_DAY_YEAR.format(t);
  // Whole years, counted on the calendar like a birthday.
  const years = Number(today.slice(0, 4)) - Number(taken.slice(0, 4)) - (today.slice(5, 10) < taken.slice(5, 10) ? 1 : 0);
  return years >= 1 ? `${date} · ${years === 1 ? "a year ago" : `${years} years ago`}` : date;
}
