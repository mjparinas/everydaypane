import { z } from "zod";

import { loadConfig } from "@/server/config";
import { act, haFeed } from "@/server/homeassistant";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

/** The states of the entities this dashboard shows. Polled every few seconds by displays with Home Assistant widgets. */
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    return json(await haFeed((await loadConfig()).config));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Home Assistant didn't answer" }, 502);
  }
}

const body = z.object({
  entity: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  action: z.enum(["toggle", "on", "off", "brightness", "open", "close", "stop", "lock", "press", "temperature"]),
  value: z.number().optional(),
});

/** A tap on a display: one of a fixed set of actions, on an entity that a widget shows. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await viewerFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 2000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  try {
    const result = await act((await loadConfig()).config, parsed.data.entity, parsed.data.action, parsed.data.value);
    return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Home Assistant didn't answer" }, 502);
  }
}
