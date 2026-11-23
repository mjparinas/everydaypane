import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CryptoData, CryptoQuote } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// CoinGecko free API (Phase 5): no key.

const API = "https://api.coingecko.com/api/v3";
const TTL = 2 * 60_000;

const simpleSchema = z.record(z.string(), z.record(z.string(), z.number()));

function coinsOf(config: DashboardConfig): { ids: string[]; vs: Set<string> } {
  const ids = new Set<string>();
  const vs = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type === "crypto") {
        for (const c of w.coins) ids.add(c.toLowerCase());
        vs.add(w.vs.toLowerCase());
      }
    }
  }
  return { ids: [...ids].slice(0, 40), vs };
}

export async function cryptoFeed(config: DashboardConfig): Promise<CryptoData> {
  const { ids, vs } = coinsOf(config);
  const currencies = [...vs].join(",").slice(0, 60) || "cad";
  const key = `crypto:${ids.join(",")}:${currencies}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    if (ids.length === 0) return {} as Record<string, CryptoQuote>;
    const raw = await getJson(`${API}/simple/price?ids=${ids.join(",")}&vs_currencies=${currencies}&include_24hr_change=true`);
    const p = simpleSchema.safeParse(raw);
    const out: Record<string, CryptoQuote> = {};
    if (!p.success) return out;
    for (const [id, row] of Object.entries(p.data)) {
      for (const [cur, price] of Object.entries(row)) {
        if (cur.endsWith("_24h_change")) continue;
        const chKey = `${cur}_24h_change`;
        out[id] = { id, currency: cur.toUpperCase(), price, changePct: row[chKey] ?? 0 };
      }
    }
    return out;
  });
  return { updatedAt: fetchedAt, stale, quotes: value as Record<string, CryptoQuote> };
}
