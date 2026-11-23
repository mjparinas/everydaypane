import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { RssData } from "@/lib/display/types";
import { newsPresetUrl } from "@/lib/newsPresets";

import { cached, getJson } from "./cache";
import { env } from "./env";
import { parseRss } from "./rssParse";

// RSS and news headlines (Phase 5): server fetch and trim.

const TTL = 5 * 60_000;

function feedUrls(config: DashboardConfig, widgetId: string): { id: string; name: string; url: string }[] {
  const out: { id: string; name: string; url: string }[] = [];
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type === "rss" && w.feeds.length) {
        for (const f of w.feeds) out.push({ id: f.id, name: f.name, url: f.url });
      }
      if (w.type === "news" && w.id === widgetId) {
        if (w.source === "preset") {
          const url = newsPresetUrl(w.presetId as Parameters<typeof newsPresetUrl>[0]);
          if (url) out.push({ id: `preset-${w.presetId}`, name: "News", url });
        } else if (w.source === "custom" && w.customUrl.startsWith("http")) {
          out.push({ id: "custom", name: "News", url: w.customUrl });
        }
      }
    }
  }
  return out.slice(0, 12);
}

async function loadFeed(url: string, max: number) {
  const r = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  return parseRss(await r.text(), max);
}

async function gnews(query: string, max: number) {
  const key = env.gnewsKey();
  if (!key || !query.trim()) return [];
  const raw = await getJson(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=${max}&token=${key}`);
  const items = (raw as { articles?: { title?: string; url?: string }[] }).articles ?? [];
  return items
    .map((a) => ({ title: (a.title ?? "").slice(0, 200), link: (a.url ?? "").slice(0, 500) }))
    .filter((i) => i.title && i.link.startsWith("http"));
}

export async function rssFeedFor(config: DashboardConfig, widgetId: string, max: number): Promise<RssData> {
  const feeds = feedUrls(config, widgetId);
  const news = config.views.flatMap((v) => v.widgets).find((w) => w.type === "news" && w.id === widgetId);
  const key = `rss:${widgetId}:${feeds.map((f) => f.url).join("|")}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    if (news?.type === "news" && news.source === "gnews") {
      return { items: await gnews(news.query, max) };
    }
    const items = [];
    for (const f of feeds) {
      const chunk = await loadFeed(f.url, max);
      for (const row of chunk) items.push({ ...row, feed: f.name });
      if (items.length >= max) break;
    }
    return { items: items.slice(0, max) };
  });
  const v = value as { items: RssData["items"] };
  return { updatedAt: fetchedAt, stale, items: v.items };
}
