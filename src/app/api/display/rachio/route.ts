import { z } from "zod";

import { loadConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { rachioFeed, RachioRefused, skipNext } from "@/server/rachio";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** Each controller's next watering, shared by every Sprinklers widget. Displays poll it every five minutes. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await rachioFeed(accountIdOf(viewer)));
}

const body = z.object({
  controller: z.string().min(1).max(64),
  start: z.number().int().positive(),
});

/** A tap on the wall: skips one controller's next watering, when a Sprinklers widget with Skip on shows it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  try {
    const { config } = await loadConfig(accountId);
    const result = await skipNext(accountId, config, parsed.data.controller, parsed.data.start);
    if (result === "not-allowed") return json({ error: "Not allowed" }, 403);
    if (result === "gone") return json({ error: "That watering changed. Look again." }, 502);
    if (result === "too-far") return json({ error: "Too far ahead to skip from here" }, 502);
    return json({ ok: true, how: result });
  } catch (e) {
    return json({ error: e instanceof RachioRefused ? "Rachio refused the API key" : "Rachio didn't answer" }, 502);
  }
}
