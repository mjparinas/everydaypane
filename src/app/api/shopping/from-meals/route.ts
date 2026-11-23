import { loadConfig } from "@/server/config";
import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorKey } from "@/server/familyAuth";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { addShoppingFromMeals } from "@/server/shopping";

// "Add from this week's meals" (Melvin, 2026-11-22): each distinct meal for the next seven days that isn't already open.

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const key = familyEditorKey(editor);
  if (!(await rateLimit(`shopping:${key}`, 180, 60 * 60_000))) return json({ error: "That's a lot of items. Try again later." }, 429);
  const added = await addShoppingFromMeals(accountId, (await loadConfig(accountId)).config, key);
  return json({ added });
}