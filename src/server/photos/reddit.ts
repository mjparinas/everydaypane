import "server-only";

import { cached } from "../cache";
import { fetchPublicHttps } from "../publicUrl";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

interface RedditListing {
  data?: {
    children?: {
      data?: { id?: string; url?: string; preview?: { images?: { source?: { url?: string; width?: number; height?: number } }[] } };
    }[];
  };
}

function cleanUrl(url: string): string {
  return url.replace(/&amp;/g, "&");
}

function trim(raw: unknown, sub: string): Listed[] {
  const listing = raw as RedditListing;
  const out: Listed[] = [];
  for (const child of listing.data?.children ?? []) {
    const d = child.data;
    if (!d?.id) continue;
    const preview = d.preview?.images?.[0]?.source;
    const url = cleanUrl(preview?.url ?? d.url ?? "");
    if (!url.startsWith("https://") || /\.(gif|mp4)$/i.test(url)) continue;
    out.push({
      id: d.id,
      url,
      w: Number(preview?.width) || 0,
      h: Number(preview?.height) || 0,
      taken: null,
    });
    if (out.length >= MAX_PHOTOS) break;
  }
  if (!out.length) throw new Error(`r/${sub} didn't list any photos`);
  return out;
}

export async function listReddit(subreddit: string, sort: "hot" | "new" | "top", now = Date.now()): Promise<Listed[]> {
  const sub = subreddit.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60);
  if (!sub) throw new Error("Pick a subreddit name");
  const key = `photos:reddit:${sub}:${sort}`;
  const result = await cached(
    key,
    TTL,
    async () => {
      const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=50&raw_json=1`;
      const r = await fetchPublicHttps(url, {
        headers: { "User-Agent": "Everydaypane/1.0 (photo frame)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`Reddit answered ${r.status}`);
      return trim(await r.json(), sub);
    },
    now,
  );
  return result.value;
}
