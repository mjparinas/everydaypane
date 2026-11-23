import { z } from "zod";

import { localDate } from "@/lib/calendar";
import { MEAL_SLOTS, normalizeRepeat, type MealRepeat } from "@/lib/meals";
import { loadConfig } from "@/server/config";
import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorKey } from "@/server/familyAuth";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { deleteMealRule, MEAL_MAX, mealPlan, recentMeals, setMeal, updateMealRuleText, upsertMealRule } from "@/server/meals";

// The meal planner, for anyone signed in (admins and FAMILY_EMAILS) or a phone that opened `/d/<token>/edit/`.
// PUT can set a one-off day, create/update a recurring cadence, change a series' text, or stop a series.

const isoDate = z.iso.date();

const repeatSchema = z.union([
  z.object({ kind: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
  z.object({ kind: z.literal("interval"), every: z.number().int().min(1).max(14) }),
]);

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const today = localDate(Date.now(), (await loadConfig(accountId)).config.location.timeZone);
  const url = new URL(req.url);
  const from = isoDate.safeParse(url.searchParams.get("from"));
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 28);
  const start = from.success ? from.data : today;
  const [plan, recent] = await Promise.all([mealPlan(accountId, start, days), recentMeals(accountId)]);
  return json({ today, from: start, days, meals: plan.meals, origins: plan.origins, rules: plan.rules, recent });
}

const body = z.object({
  date: isoDate.optional(),
  slot: z.enum(MEAL_SLOTS).optional(),
  text: z.string().trim().max(MEAL_MAX, `Keep it under ${MEAL_MAX} characters`).optional(),
  // day = one date only (default); series = whole recurring rule.
  apply: z.enum(["day", "series"]).optional(),
  ruleId: z.string().min(1).max(64).optional(),
  // Set a cadence (creates/updates a rule). null means "this day only" when apply is day.
  repeat: repeatSchema.nullable().optional(),
  // Stop a series without touching other days' one-offs.
  stopRuleId: z.string().min(1).max(64).optional(),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const key = familyEditorKey(editor);
  if (!(await rateLimit(`meals:${key}`, 300, 60 * 60_000))) return json({ error: "That's a lot of changes. Try again later." }, 429);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const data = parsed.data;

  if (data.stopRuleId) {
    if (!(await deleteMealRule(accountId, data.stopRuleId))) return json({ error: "That repeat wasn't found." }, 404);
    return json({ ok: true });
  }

  const apply = data.apply ?? "day";
  const text = data.text ?? "";

  if (apply === "series") {
    if (!data.ruleId) return json({ error: "Which series?" }, 400);
    if (!text) {
      if (!(await deleteMealRule(accountId, data.ruleId))) return json({ error: "That repeat wasn't found." }, 404);
      return json({ ok: true });
    }
    const rule = await updateMealRuleText(accountId, data.ruleId, text, key);
    if (!rule) return json({ error: "That repeat wasn't found." }, 404);
    return json({ ok: true, rule });
  }

  if (!data.date || !data.slot) return json({ error: "Pick a day and a meal." }, 400);

  if (data.repeat) {
    if (!text) return json({ error: "Type the meal before setting a repeat." }, 400);
    const repeat = normalizeRepeat(data.repeat as MealRepeat);
    if (!repeat) return json({ error: "That repeat isn't valid." }, 400);
    const rule = await upsertMealRule(accountId, {
      slot: data.slot,
      text,
      repeat,
      start: data.date,
      by: key,
      id: data.ruleId,
    });
    if (!rule) return json({ error: "Couldn't save that repeat." }, 400);
    return json({ ok: true, rule });
  }

  // Classic one-off (or skip when a rule covers the day).
  await setMeal(accountId, { date: data.date, slot: data.slot, text, by: key });
  return json({ ok: true });
}
