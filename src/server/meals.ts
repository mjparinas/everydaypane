import "server-only";

import { createHash } from "node:crypto";

import { addDays } from "@/lib/calendar";
import { MEAL_SLOTS, type DayMeals, type MealSlot } from "@/lib/meals";

import { query, run } from "./db";

// The family's meal plan (Melvin, 2026-11-17): breakfast, lunch and dinner for each day, planned from a phone in the
// admin panel or on /family/, and shown by the displays' meals widget. One row per day and meal; clearing a meal
// deletes its row. Plans more than two months old are cleared out as new ones are written, so no cron job is needed.

export const MEAL_MAX = 120;
const KEEP_DAYS = 60;

type Row = { date: string; slot: string; text: string };

const isSlot = (s: string): s is MealSlot => (MEAL_SLOTS as readonly string[]).includes(s);

/** The plan for each day from `from` for `days` days (local dates). Days with nothing planned are left out. */
export async function mealsBetween(accountId: string, from: string, days: number): Promise<Record<string, DayMeals>> {
  const rows = await query<Row>(
    "SELECT date, slot, text FROM account_meals WHERE account_id = ? AND date >= ? AND date < ? ORDER BY date",
    [accountId, from, addDays(from, days)],
  );
  const plan: Record<string, DayMeals> = {};
  for (const r of rows) if (isSlot(r.slot)) (plan[r.date] ??= {})[r.slot] = r.text;
  return plan;
}

/** Sets one meal; empty text clears it. */
export async function setMeal(
  accountId: string,
  input: { date: string; slot: MealSlot; text: string; by: string },
  now = Date.now(),
): Promise<void> {
  const text = input.text.trim();
  if (!text) {
    await run("DELETE FROM account_meals WHERE account_id = ? AND date = ? AND slot = ?", [accountId, input.date, input.slot]);
    return;
  }
  await run(
    `INSERT INTO account_meals (account_id, date, slot, text, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, date, slot) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [accountId, input.date, input.slot, text, now, input.by],
  );
  await run("DELETE FROM account_meals WHERE account_id = ? AND date < ?", [accountId, addDays(input.date, -KEEP_DAYS)]);
}

/** Meals planned lately, most recent first, for the planner's suggestions ("Tacos" again on Tuesday). */
export async function recentMeals(accountId: string, limit = 60): Promise<string[]> {
  const rows = await query<{ text: string }>(
    "SELECT text FROM account_meals WHERE account_id = ? GROUP BY text ORDER BY MAX(updated_at) DESC LIMIT ?",
    [accountId, limit],
  );
  return rows.map((r) => r.text);
}

/** A tag that changes whenever the plan a display sees does, so displays can poll with If-None-Match. */
export const planTag = (body: unknown) => `"meals-${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;
