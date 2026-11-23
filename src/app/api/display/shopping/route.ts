import { z } from "zod";

import { loadConfig } from "@/server/config";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { listShopping, setShoppingDone, shoppingTag } from "@/server/shopping";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The shopping list for the shopping widget. Displays poll it every minute; an unchanged list answers 304. A tap ticks
// an item off, or puts it back, only when a shopping widget allows tapping.

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const body = await listShopping(accountId);
  const tag = shoppingTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const body = z.object({ id: z.string().min(1).max(64), done: z.boolean() });

/** A tap on the wall: ticks one item off, or puts it back. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setShoppingDone(accountId, (await loadConfig(accountId)).config, parsed.data);
  if (result === "ok") return json({ ok: true });
  if (result === "not-found") return notFound();
  return json({ error: "Not allowed" }, 403);
}
