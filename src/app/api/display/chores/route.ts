import { z } from "zod";

import { choreBoard, choresTag, setChoreDone } from "@/server/chores";
import { loadConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The chore chart for the chores widget: today's chores, who has them, what's done and the week's stars. Displays poll
// it every minute; an unchanged chart answers 304.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const body = await choreBoard(accountId, (await loadConfig(accountId)).config);
  const tag = choresTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const body = z.object({ chore: z.string().min(1).max(64), person: z.string().min(1).max(64), done: z.boolean() });

/** A tap on the wall: ticks one of today's chores off for one person, or takes the tick back. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setChoreDone(accountId, (await loadConfig(accountId)).config, parsed.data);
  return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
}
