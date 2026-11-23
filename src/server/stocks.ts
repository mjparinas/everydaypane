import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { StockQuote, StocksData } from "@/lib/display/types";

import { cached, getJson } from "./cache";
import { env } from "./env";

// Watchlist quotes (Phase 5): Yahoo Finance's unofficial chart API, or Finnhub when FINNHUB_API_KEY is set.

const TTL = 60_000;

const yahooSchema = z.object({
  chart: z
    .object({
      result: z
        .array(
          z.object({
            meta: z
              .object({
                symbol: z.string().optional(),
                regularMarketPrice: z.number().optional(),
                previousClose: z.number().optional(),
                currency: z.string().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const finnhubSchema = z.object({
  c: z.number().optional(),
  d: z.number().optional(),
  dp: z.number().optional(),
});

function symbolsOf(config: DashboardConfig): string[] {
  const set = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type === "stocks") for (const s of w.symbols) set.add(s.toUpperCase());
    }
  }
  return [...set].slice(0, 40);
}

async function yahooQuote(symbol: string): Promise<StockQuote | null> {
  const raw = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  const p = yahooSchema.safeParse(raw);
  const meta = p.success ? p.data.chart?.result?.[0]?.meta : undefined;
  if (!meta?.regularMarketPrice) return null;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? price;
  const change = price - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  return { symbol: (meta.symbol ?? symbol).toUpperCase(), price, change, changePct, currency: meta.currency ?? "" };
}

async function finnhubQuote(symbol: string): Promise<StockQuote | null> {
  const key = env.finnhubKey();
  if (!key) return null;
  const raw = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`);
  const p = finnhubSchema.safeParse(raw);
  if (!p.success || p.data.c === undefined) return null;
  return {
    symbol: symbol.toUpperCase(),
    price: p.data.c,
    change: p.data.d ?? 0,
    changePct: p.data.dp ?? 0,
    currency: "",
  };
}

async function quote(symbol: string): Promise<StockQuote | null> {
  try {
    if (env.finnhubKey()) return (await finnhubQuote(symbol)) ?? (await yahooQuote(symbol));
    return await yahooQuote(symbol);
  } catch {
    return null;
  }
}

export async function stocksFeed(config: DashboardConfig): Promise<StocksData> {
  const symbols = symbolsOf(config);
  const { value, fetchedAt, stale } = await cached(`stocks:${symbols.join(",")}`, TTL, async () => {
    const quotes: Record<string, StockQuote> = {};
    for (const s of symbols) {
      const q = await quote(s);
      if (q) quotes[s] = q;
    }
    return quotes;
  });
  return { updatedAt: fetchedAt, stale, quotes: value as Record<string, StockQuote> };
}
