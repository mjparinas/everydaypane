import "server-only";

import { query, run } from "./db";

/**
 * Family lists a phone (or another wall) can change. Each name is the display feed path the wall refreshes when the
 * counter moves (Melvin, 2026-11-26: "why do messages or other updates take 30 seconds to load"). The settings
 * document keeps its own version in `account_config`.
 */
export const LIVE_FEEDS = ["messages", "shopping", "meals", "chores", "whiteboard", "calendar", "photos"] as const;
export type LiveFeed = (typeof LIVE_FEEDS)[number];

/** Marks a family list as changed. Never throws: a missed bump only means the wall's own timer picks it up. */
export async function markChanged(accountId: string, feed: LiveFeed): Promise<void> {
  try {
    await run(
      `INSERT INTO account_changes (account_id, feed, version) VALUES (?, ?, 1)
       ON CONFLICT (account_id, feed) DO UPDATE SET version = version + 1`,
      [accountId, feed],
    );
  } catch (error) {
    console.error("[changes] bump failed", error);
  }
}

export interface Versions {
  config: number;
  feeds: Partial<Record<LiveFeed, number>>;
}

/** The settings version and every list's counter, in one read (config-watch asks every 2.5 seconds). */
export async function versions(accountId: string): Promise<Versions> {
  const rows = await query<{ feed: string; version: number }>(
    `SELECT '' AS feed, version FROM account_config WHERE account_id = ?
     UNION ALL SELECT feed, version FROM account_changes WHERE account_id = ?`,
    [accountId, accountId],
  );
  const out: Versions = { config: 0, feeds: {} };
  for (const r of rows) {
    if (r.feed === "") out.config = Number(r.version);
    else if ((LIVE_FEEDS as readonly string[]).includes(r.feed)) out.feeds[r.feed as LiveFeed] = Number(r.version);
  }
  return out;
}

/** "messages:3,shopping:5" ↔ counters: short enough for a query string, no JSON parsing on the wall. */
export function parseSeen(text: string | null): Partial<Record<LiveFeed, number>> | null {
  if (text === null) return null;
  const out: Partial<Record<LiveFeed, number>> = {};
  for (const part of text.split(",")) {
    const [name, n] = part.split(":");
    if (name && (LIVE_FEEDS as readonly string[]).includes(name) && Number.isFinite(Number(n))) out[name as LiveFeed] = Number(n);
  }
  return out;
}

/** Lists whose counter differs from what the wall last saw. */
export function changedFeeds(seen: Partial<Record<LiveFeed, number>>, now: Partial<Record<LiveFeed, number>>): LiveFeed[] {
  return LIVE_FEEDS.filter((f) => (now[f] ?? 0) !== (seen[f] ?? 0));
}
