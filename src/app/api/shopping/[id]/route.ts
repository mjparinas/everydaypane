import { z } from "zod";

import { SHOPPING_CATEGORIES } from "@/lib/shopping";
import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorKey } from "@/server/familyAuth";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { removeShoppingItem, setShoppingDoneFromPhone, updateShoppingItem } from "@/server/shopping";

// Ticking, moving to another aisle, marking running low and removing one item, for a signed-in phone or `/d/<token>/edit/`. The wall has its own route and must
// have allowCheck on.

const limited = (key: string) => rateLimit(`shopping:${key}`, 180, 60 * 60_000);
const tooMany = () => json({ error: "That's a lot of items. Try again later." }, 429);

const patch = z
  .object({ done: z.boolean().optional(), category: z.enum(SHOPPING_CATEGORIES).optional(), low: z.boolean().optional() })
  .refine((b) => b.done !== undefined || b.category !== undefined || b.low !== undefined);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  if (!(await limited(familyEditorKey(editor)))) return tooMany();
  const parsed = patch.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const id = (await ctx.params).id;
  const { done, category, low } = parsed.data;
  if (category !== undefined || low !== undefined) {
    if ((await updateShoppingItem(accountId, { id, category, low })) !== "ok") return notFound();
  }
  if (done !== undefined && (await setShoppingDoneFromPhone(accountId, { id, done })) !== "ok") return notFound();
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  if (!(await limited(familyEditorKey(editor)))) return tooMany();
  return (await removeShoppingItem(accountId, (await ctx.params).id)) ? json({ ok: true }) : notFound();
}
