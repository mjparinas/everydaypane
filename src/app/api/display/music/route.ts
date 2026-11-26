import { z } from "zod";

import { loadDisplayConfig } from "@/server/featureFlags";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { MUSIC_ACTIONS, musicAct, musicFeed, PLAYER_KEY } from "@/server/music";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** What the Spotify and Sonos music widgets show. Polled every few seconds by displays that have one. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    const { config } = await loadDisplayConfig(accountId);
    return json(await musicFeed(accountId, config));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No answer" }, 502);
  }
}

const body = z.object({
  player: z.string().regex(PLAYER_KEY),
  action: z.enum(MUSIC_ACTIONS),
  value: z.number().optional(),
  // A Sonos favourite or a Spotify Connect speaker, by name.
  option: z.string().min(1).max(120).optional(),
});

/** A tap on a display: one of a fixed set of actions, on a player that a widget shows. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 2000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const { player, action, value, option } = parsed.data;
  try {
    const { config } = await loadDisplayConfig(accountId);
    const result = await musicAct(accountId, config, player, action, value, option);
    return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No answer" }, 502);
  }
}
