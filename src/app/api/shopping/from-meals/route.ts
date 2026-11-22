import { loadConfig } from "@/server/config";
import { rateLimit } from "@/server/db";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { addShoppingFromMeals } from "@/server/shopping";
import { requestSession } from "@/server/viewer";

// "Add from this week's meals" (Melvin, 2026-11-22): each distinct meal for the next seven days that isn't already open.

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`shopping:${session.email}`, 180, 60 * 60_000)))
    return json({ error: "That's a lot of items. Try again later." }, 429);
  const added = await addShoppingFromMeals((await loadConfig()).config, session.email);
  return json({ added });
}
