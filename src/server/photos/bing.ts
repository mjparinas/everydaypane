import "server-only";

import { cached } from "../cache";
import { fetchPublicHttps } from "../publicUrl";
import type { Listed } from "./types";

const TTL = 24 * 60 * 60_000;

interface BingAnswer {
  images?: { url?: string; width?: number; height?: number; startdate?: string; copyright?: string }[];
}

export function trimBing(raw: unknown): Listed[] {
  const data = raw as BingAnswer;
  const img = data.images?.[0];
  if (!img?.url) return [];
  const url = img.url.startsWith("http") ? img.url : `https://www.bing.com${img.url}`;
  const taken =
    img.startdate?.length === 8 ? `${img.startdate.slice(0, 4)}-${img.startdate.slice(4, 6)}-${img.startdate.slice(6, 8)}` : null;
  return [{ id: "bing0", url, w: Number(img.width) || 1920, h: Number(img.height) || 1080, taken }];
}

/** Bing picture of the day (no key). */
export async function listBingPotd(now = Date.now()): Promise<Listed[]> {
  const url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-CA";
  const result = await cached(
    "photos:bingPotd",
    TTL,
    async () => {
      const r = await fetchPublicHttps(url, { signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error("Bing didn't answer");
      return trimBing(await r.json());
    },
    now,
  );
  return result.value;
}
