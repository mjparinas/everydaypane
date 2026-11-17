import { z } from "zod";

import { localDate } from "@/lib/calendar";
import { MEAL_SLOTS } from "@/lib/meals";
import { loadConfig } from "@/server/config";
import { rateLimit } from "@/server/db";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { MEAL_MAX, mealsBetween, recentMeals, setMeal } from "@/server/meals";
import { requestSession } from "@/server/viewer";

// The meal planner, for anyone signed in (admins and FAMILY_EMAILS): planning dinner is a family job.

const isoDate = z.iso.date();

export async function GET(req: Request) {
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const today = localDate(Date.now(), (await loadConfig()).config.location.timeZone);
  const url = new URL(req.url);
  const from = isoDate.safeParse(url.searchParams.get("from"));
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 28);
  const start = from.success ? from.data : today;
  const [meals, recent] = await Promise.all([mealsBetween(start, days), recentMeals()]);
  return json({ today, from: start, days, meals, recent });
}

const body = z.object({
  date: isoDate,
  slot: z.enum(MEAL_SLOTS),
  text: z.string().trim().max(MEAL_MAX, `Keep it under ${MEAL_MAX} characters`),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`meals:${session.email}`, 300, 60 * 60_000)))
    return json({ error: "That's a lot of changes. Try again later." }, 429);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  await setMeal({ ...parsed.data, by: session.email });
  return json({ ok: true });
}
