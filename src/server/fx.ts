import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { FxData, FxRate } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// Frankfurter / ECB (Phase 5): free, no key.

const TTL = 30 * 60_000;

const answerSchema = z.object({
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

function pairsOf(config: DashboardConfig): { base: string; quote: string }[] {
  const out: { base: string; quote: string }[] = [];
  const seen = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "fx") continue;
      for (const p of w.pairs) {
        const base = p.base.toUpperCase();
        const quote = p.quote.toUpperCase();
        const key = `${base}/${quote}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ base, quote });
      }
    }
  }
  return out.slice(0, 24);
}

export async function fxFeed(config: DashboardConfig): Promise<FxData> {
  const pairs = pairsOf(config);
  const key = `fx:${pairs.map((p) => `${p.base}${p.quote}`).join(",")}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const rates: FxRate[] = [];
    const byBase = new Map<string, string[]>();
    for (const p of pairs) {
      const list = byBase.get(p.base) ?? [];
      list.push(p.quote);
      byBase.set(p.base, list);
    }
    for (const [base, quotes] of byBase) {
      const raw = await getJson(`https://api.frankfurter.app/latest?from=${base}&to=${quotes.join(",")}`);
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) continue;
      for (const quote of quotes) {
        const rate = parsed.data.rates[quote];
        if (rate === undefined) continue;
        rates.push({ base, quote, rate, date: parsed.data.date });
      }
    }
    return rates;
  });
  return { updatedAt: fetchedAt, stale, rates: value as FxRate[] };
}
