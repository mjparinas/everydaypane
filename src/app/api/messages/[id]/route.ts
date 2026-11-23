import { z } from "zod";

import { familyEditorFor, familyEditorIsAdmin, familyEditorKey } from "@/server/familyAuth";
import { forbidden, json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { pinMessage, removeMessage } from "@/server/messages";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const result = await removeMessage((await ctx.params).id, {
    email: familyEditorKey(editor),
    admin: familyEditorIsAdmin(editor),
  });
  if (result === "not-found") return notFound();
  if (result === "forbidden") return forbidden();
  return json({ ok: true });
}

const patch = z.object({ pinned: z.boolean() });

/** Pinning keeps a note at the top of every board. Admins only (not the kitchen edit link). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  if (!familyEditorIsAdmin(editor)) return forbidden();
  const parsed = patch.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  return (await pinMessage((await ctx.params).id, parsed.data.pinned)) ? json({ ok: true }) : notFound();
}
