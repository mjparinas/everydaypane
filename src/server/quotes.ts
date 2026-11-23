import "server-only";

import { z } from "zod";

import type { QuotesData } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// Quotable.io (Phase 5): free, no key.

const TTL = 15 * 60_000;

const oneSchema = z.object({
  content: z.string(),
  author: z.string(),
});

const manySchema = z.array(oneSchema);

export async function quotesFeed(tags: string[], count: number): Promise<QuotesData> {
  const key = `quotes:${tags.join(",")}:${count}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const params = new URLSearchParams({ limit: String(Math.min(count, 8)) });
    if (tags.length > 0) params.set("tags", tags.slice(0, 3).join("|"));
    const raw = await getJson(`https://api.quotable.io/quotes?${params}`);
    const p = manySchema.safeParse(raw);
    if (!p.success) {
      const one = oneSchema.safeParse(await getJson("https://api.quotable.io/random"));
      return one.success ? [{ text: one.data.content, author: one.data.author }] : [];
    }
    return p.data.map((q) => ({ text: q.content.slice(0, 240), author: q.author.slice(0, 60) }));
  });
  return { updatedAt: fetchedAt, stale, quotes: value as QuotesData["quotes"] };
}
