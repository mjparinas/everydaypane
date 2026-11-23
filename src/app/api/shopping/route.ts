import { z } from "zod";

import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorKey } from "@/server/familyAuth";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { addShoppingItem, clearDoneShopping, ITEM_MAX, listShopping } from "@/server/shopping";

// The family shopping list, for anyone signed in or a phone on `/d/<token>/edit/`.

const WRITES_PER_HOUR = 180;
const limited = (key: string) => rateLimit(`shopping:${key}`, WRITES_PER_HOUR, 60 * 60_000);
const tooMany = () => json({ error: "That's a lot of items. Try again later." }, 429);

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  return json(await listShopping(accountId));
}

const body = z.object({
  text: z.string().trim().min(1, "Write an item").max(ITEM_MAX, `Keep it under ${ITEM_MAX} characters`),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const key = familyEditorKey(editor);
  if (!(await limited(key))) return tooMany();
  const parsed = body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const result = await addShoppingItem(accountId, { text: parsed.data.text, by: key });
  if (!result.ok) {
    const message = result.error === "full" ? "The list is full (100 items). Tick some off or remove them." : "Write an item";
    return json({ error: message }, 400);
  }
  return json({ item: result.item }, 201);
}

/** Deletes bought items (`?done=1`). Open items stay. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  if (new URL(req.url).searchParams.get("done") !== "1") return json({ error: "Bad request" }, 400);
  const accountId = familyEditorAccountId(editor);
  if (!(await limited(familyEditorKey(editor)))) return tooMany();
  return json({ ok: true, removed: await clearDoneShopping(accountId) });
}
