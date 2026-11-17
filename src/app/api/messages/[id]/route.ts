import { z } from "zod";

import { forbidden, json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { pinMessage, removeMessage } from "@/server/messages";
import { requestSession } from "@/server/viewer";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const result = await removeMessage((await ctx.params).id, { email: session.email, admin: session.role === "admin" });
  if (result === "not-found") return notFound();
  if (result === "forbidden") return forbidden();
  return json({ ok: true });
}

const patch = z.object({ pinned: z.boolean() });

/** Pinning keeps a note at the top of every board. Admins only. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  const parsed = patch.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  return (await pinMessage((await ctx.params).id, parsed.data.pinned)) ? json({ ok: true }) : notFound();
}
