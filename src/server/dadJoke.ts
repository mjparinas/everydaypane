import "server-only";

import type { DadJokeData } from "@/lib/display/types";

import { cached, getJson } from "./cache";

// icanhazdadjoke.com (Phase 5): free, no key.

const TTL = 10 * 60_000;

export async function dadJokeFeed(familyFriendly: boolean): Promise<DadJokeData> {
  const key = `dadjoke:${familyFriendly ? "safe" : "all"}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Everydaypane/1.0" };
    if (familyFriendly) headers["X-Requested-With"] = "";
    const raw = (await getJson("https://icanhazdadjoke.com/", { headers })) as { joke?: string; status?: number };
    return (raw.joke ?? "").slice(0, 300);
  });
  return { updatedAt: fetchedAt, stale, joke: value as string };
}
