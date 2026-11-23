import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TrelloData, TrelloList } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Trello API key + member token (Phase 5): board lists and open cards.

const API = "https://api.trello.com/1";
const TTL = 60_000;

export class TrelloDisconnected extends Error {
  constructor() {
    super("Add your Trello token under Settings");
  }
}

export const trelloConfigured = () => Boolean(env.trelloApiKey());

export async function saveTrelloToken(accountId: string, token: string, now = Date.now()): Promise<void> {
  await setSecret(accountId, "trello.token", token, now);
  await forget("trello:");
}

async function call(accountId: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const key = env.trelloApiKey();
  const token = await getSecret(accountId, "trello.token");
  if (!key || !token) throw new TrelloDisconnected();
  const q = new URLSearchParams({ key, token, ...params });
  const r = await fetch(`${API}${path}?${q}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 401) throw new TrelloDisconnected();
  if (!r.ok) throw new Error(`Trello answered ${r.status}`);
  return r.json();
}

const listSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    cards: z.array(z.object({ name: z.string() })).optional(),
  }),
);

export async function trelloFeed(
  accountId: string,
  config: DashboardConfig,
  boardId: string,
  listCount: number,
  cardCount: number,
): Promise<TrelloData> {
  const board = boardId || config.integrations.trello.boardId;
  const key = `trello:${accountId}:${board}:${listCount}:${cardCount}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    if (!board) throw new TrelloDisconnected();
    const raw = await call(accountId, `/boards/${board}/lists`, {
      cards: "open",
      card_fields: "name",
      fields: "name",
      cards_limit: String(cardCount),
    });
    const lists = listSchema
      .parse(raw)
      .slice(0, listCount)
      .map((l): TrelloList => ({
        name: l.name.slice(0, 60),
        cards: (l.cards ?? []).slice(0, cardCount).map((c) => c.name.slice(0, 80)),
      }));
    return { boardName: config.integrations.trello.boardName || "Board", lists };
  });
  const v = value as { boardName: string; lists: TrelloList[] };
  return { updatedAt: fetchedAt, stale, connected: true, ...v };
}
