import { z } from "zod";

import { rateLimit } from "@/server/db";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { removeShoppingItem, setShoppingDoneFromPhone } from "@/server/shopping";
import { requestSession } from "@/server/viewer";

// Ticking and removing one item, for a signed-in phone. The wall has its own route and must have allowCheck on.

const limited = (email: string) => rateLimit(`shopping:${email}`, 180, 60 * 60_000);
const tooMany = () => json({ error: "That's a lot of items. Try again later." }, 429);

const patch = z.object({ done: z.boolean() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await limited(session.email))) return tooMany();
  const parsed = patch.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setShoppingDoneFromPhone({ id: (await ctx.params).id, done: parsed.data.done });
  return result === "ok" ? json({ ok: true }) : notFound();
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await limited(session.email))) return tooMany();
  return (await removeShoppingItem((await ctx.params).id)) ? json({ ok: true }) : notFound();
}
