import { z } from "zod";

import { loadDisplayConfig } from "@/server/featureFlags";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { addShoppingFromWall, listShopping, setShoppingDone, shoppingTag } from "@/server/shopping";
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

const doneBody = z.object({ id: z.string().min(1).max(64), done: z.boolean() });
const addBody = z.object({ text: z.string().min(1).max(80) });

/** A tap on the wall: ticks one item off, puts it back, or adds a line when the widget allows it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const raw = await readJson(req, 1_000).catch(() => null);
  const config = (await loadDisplayConfig(accountId)).config;
  const add = addBody.safeParse(raw);
  if (add.success) {
    const by = viewer.kind === "device" ? `display:${viewer.device.id}` : "wall";
    const result = await addShoppingFromWall(accountId, config, { text: add.data.text }, by);
    if (result.ok) return json({ ok: true, item: result.item }, 201);
    if (result.error === "forbidden") return json({ error: "Not allowed" }, 403);
    if (result.error === "full") return json({ error: "The list is full." }, 409);
    return json({ error: "Bad request" }, 400);
  }
  const parsed = doneBody.safeParse(raw);
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setShoppingDone(accountId, config, parsed.data);
  if (result === "ok") return json({ ok: true });
  if (result === "not-found") return notFound();
  return json({ error: "Not allowed" }, 403);
}
