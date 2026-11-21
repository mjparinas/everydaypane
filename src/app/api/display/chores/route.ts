import { z } from "zod";

import { choreBoard, choresTag, setChoreDone } from "@/server/chores";
import { loadConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

// The chore chart for the chores widget: today's chores, who has them, what's done and the week's stars. Displays poll
// it every minute; an unchanged chart answers 304.
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const body = await choreBoard((await loadConfig()).config);
  const tag = choresTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const body = z.object({ chore: z.string().min(1).max(64), person: z.string().min(1).max(64), done: z.boolean() });

/** A tap on the wall: ticks one of today's chores off for one person, or takes the tick back. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await viewerFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setChoreDone((await loadConfig()).config, parsed.data);
  return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
}
