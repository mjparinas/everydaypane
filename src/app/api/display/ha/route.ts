import { z } from "zod";

import { loadConfig } from "@/server/config";
import { act, HA_ACTIONS, haFeed } from "@/server/homeassistant";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** The states of the entities this dashboard shows. Polled every few seconds by displays with Home Assistant widgets. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    return json(await haFeed(accountId, (await loadConfig(accountId)).config));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Home Assistant didn't answer" }, 502);
  }
}

const body = z.object({
  entity: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  action: z.enum(HA_ACTIONS),
  value: z.number().optional(),
  // A media player's source by name (a Sonos favourite, a Spotify Connect speaker).
  option: z.string().min(1).max(120).optional(),
});

/** A tap on a display: one of a fixed set of actions, on an entity that a widget shows. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 2000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  try {
    const result = await act(
      accountId,
      (await loadConfig(accountId)).config,
      parsed.data.entity,
      parsed.data.action,
      parsed.data.value,
      parsed.data.option,
    );
    return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Home Assistant didn't answer" }, 502);
  }
}
