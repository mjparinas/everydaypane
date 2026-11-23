import "server-only";

import { createHash } from "node:crypto";

import { addDays } from "@/lib/calendar";
import {
  MEAL_SLOTS,
  mergeMealPlan,
  normalizeRepeat,
  ruleApplies,
  type DayMeals,
  type MealOrigin,
  type MealOrigins,
  type MealRepeat,
  type MealRule,
  type MealSlot,
} from "@/lib/meals";

import { randomToken } from "./crypto";
import { query, run } from "./db";

// The family's meal plan (Melvin, 2026-11-17): breakfast, lunch and dinner for each day, planned from a phone in the
// admin panel or on /family/, and shown by the displays' meals widget. One row per day and meal; clearing a meal
// deletes its row (or stores an empty skip when a rule would have filled it). Plans more than two months old are
// cleared out as new ones are written, so no cron job is needed.
// Recurring rules (Melvin, 2026-11-23): account_meal_rules expand at read time so "cereal every Monday" stays set
// without retyping; a one-off for that day wins, and an empty one-off skips the rule for that day only.

export const MEAL_MAX = 120;
const KEEP_DAYS = 60;

type Row = { date: string; slot: string; text: string };
type RuleRow = {
  id: string;
  slot: string;
  text: string;
  kind: string;
  days: string | null;
  every_n: number | null;
  start_date: string;
  updated_at: number;
};

const isSlot = (s: string): s is MealSlot => (MEAL_SLOTS as readonly string[]).includes(s);

function parseRule(r: RuleRow): MealRule | null {
  if (!isSlot(r.slot)) return null;
  let repeat: MealRepeat | null = null;
  if (r.kind === "weekdays") {
    let days: unknown;
    try {
      days = r.days ? JSON.parse(r.days) : [];
    } catch {
      return null;
    }
    if (!Array.isArray(days) || !days.every((d) => typeof d === "number")) return null;
    repeat = normalizeRepeat({ kind: "weekdays", days });
  } else if (r.kind === "interval" && r.every_n != null) {
    repeat = normalizeRepeat({ kind: "interval", every: Number(r.every_n) });
  }
  if (!repeat) return null;
  return { id: r.id, slot: r.slot, text: r.text, repeat, start: r.start_date };
}

async function loadRules(accountId: string): Promise<MealRule[]> {
  // Oldest first so a newer overlapping rule wins in mergeMealPlan.
  const rows = await query<RuleRow>(
    "SELECT id, slot, text, kind, days, every_n, start_date, updated_at FROM account_meal_rules WHERE account_id = ? ORDER BY updated_at ASC",
    [accountId],
  );
  return rows.map(parseRule).filter((r): r is MealRule => r != null);
}

async function loadOnce(accountId: string, from: string, days: number): Promise<Record<string, Partial<Record<MealSlot, string | null>>>> {
  const rows = await query<Row>(
    "SELECT date, slot, text FROM account_meals WHERE account_id = ? AND date >= ? AND date < ? ORDER BY date",
    [accountId, from, addDays(from, days)],
  );
  const once: Record<string, Partial<Record<MealSlot, string | null>>> = {};
  for (const r of rows) {
    if (!isSlot(r.slot)) continue;
    (once[r.date] ??= {})[r.slot] = r.text;
  }
  return once;
}

export type MealPlan = {
  meals: Record<string, DayMeals>;
  origins: MealOrigins;
  rules: MealRule[];
};

/** The plan for each day from `from` for `days` days (local dates), with recurring rules expanded. */
export async function mealPlan(accountId: string, from: string, days: number): Promise<MealPlan> {
  const [rules, once] = await Promise.all([loadRules(accountId), loadOnce(accountId, from, days)]);
  const { meals, origins } = mergeMealPlan(from, days, rules, once);
  return { meals, origins, rules };
}

/** Merged meals only (display feed and shopping-from-meals). */
export async function mealsBetween(accountId: string, from: string, days: number): Promise<Record<string, DayMeals>> {
  return (await mealPlan(accountId, from, days)).meals;
}

function sameRepeat(a: MealRepeat, b: MealRepeat): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "interval" && b.kind === "interval") return a.every === b.every;
  if (a.kind === "weekdays" && b.kind === "weekdays") {
    return a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i]);
  }
  return false;
}

/** Creates or updates a recurring rule for a slot + cadence; returns the rule. */
export async function upsertMealRule(
  accountId: string,
  input: { slot: MealSlot; text: string; repeat: MealRepeat; start: string; by: string; id?: string },
  now = Date.now(),
): Promise<MealRule | null> {
  const text = input.text.trim();
  if (!text || text.length > MEAL_MAX) return null;
  const repeat = normalizeRepeat(input.repeat);
  if (!repeat) return null;

  let id = input.id;
  let start = input.start;
  if (id) {
    const existing = await query<{ id: string; start_date: string }>(
      "SELECT id, start_date FROM account_meal_rules WHERE account_id = ? AND id = ?",
      [accountId, id],
    );
    if (!existing[0]) id = undefined;
    else if (existing[0].start_date < start) start = existing[0].start_date;
  }
  if (!id) {
    // Reuse a rule with the same slot + cadence so "every Monday" doesn't duplicate.
    const rules = await loadRules(accountId);
    const match = [...rules].reverse().find((r) => r.slot === input.slot && sameRepeat(r.repeat, repeat));
    id = match?.id;
    if (match && match.start < start) start = match.start;
  }
  id ??= randomToken(9);

  const kind = repeat.kind;
  const days = repeat.kind === "weekdays" ? JSON.stringify(repeat.days) : null;
  const everyN = repeat.kind === "interval" ? repeat.every : null;
  await run(
    `INSERT INTO account_meal_rules (id, account_id, slot, text, kind, days, every_n, start_date, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       slot = excluded.slot, text = excluded.text, kind = excluded.kind, days = excluded.days,
       every_n = excluded.every_n, start_date = excluded.start_date, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [id, accountId, input.slot, text, kind, days, everyN, start, now, input.by],
  );
  // A matching one-off for this day is redundant once the rule covers it.
  await run("DELETE FROM account_meals WHERE account_id = ? AND date = ? AND slot = ?", [accountId, input.start, input.slot]);
  return { id, slot: input.slot, text, repeat, start };
}

export async function updateMealRuleText(
  accountId: string,
  id: string,
  text: string,
  by: string,
  now = Date.now(),
): Promise<MealRule | null> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MEAL_MAX) return null;
  const rows = await query<RuleRow>(
    "SELECT id, slot, text, kind, days, every_n, start_date, updated_at FROM account_meal_rules WHERE account_id = ? AND id = ?",
    [accountId, id],
  );
  const row = rows[0];
  if (!row) return null;
  await run("UPDATE account_meal_rules SET text = ?, updated_at = ?, updated_by = ? WHERE account_id = ? AND id = ?", [
    trimmed,
    now,
    by,
    accountId,
    id,
  ]);
  return parseRule({ ...row, text: trimmed, updated_at: now });
}

export async function deleteMealRule(accountId: string, id: string): Promise<boolean> {
  return (await run("DELETE FROM account_meal_rules WHERE account_id = ? AND id = ?", [accountId, id])) > 0;
}

/**
 * Sets one meal for a single day; empty text clears it. When a rule would fill the slot, empty text stores a skip so
 * that day stays blank without deleting the series.
 */
export async function setMeal(
  accountId: string,
  input: { date: string; slot: MealSlot; text: string; by: string },
  now = Date.now(),
): Promise<void> {
  const text = input.text.trim();
  if (!text) {
    const rules = await loadRules(accountId);
    const covered = rules.some((r) => r.slot === input.slot && ruleApplies(r, input.date));
    if (covered) {
      await run(
        `INSERT INTO account_meals (account_id, date, slot, text, updated_at, updated_by) VALUES (?, ?, ?, '', ?, ?)
         ON CONFLICT (account_id, date, slot) DO UPDATE SET text = '', updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [accountId, input.date, input.slot, now, input.by],
      );
    } else {
      await run("DELETE FROM account_meals WHERE account_id = ? AND date = ? AND slot = ?", [accountId, input.date, input.slot]);
    }
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
  const [once, rules] = await Promise.all([
    query<{ text: string; at: number }>(
      "SELECT text, MAX(updated_at) AS at FROM account_meals WHERE account_id = ? AND text != '' GROUP BY text",
      [accountId],
    ),
    query<{ text: string; at: number }>("SELECT text, MAX(updated_at) AS at FROM account_meal_rules WHERE account_id = ? GROUP BY text", [
      accountId,
    ]),
  ]);
  const best = new Map<string, number>();
  for (const r of [...once, ...rules]) {
    const prev = best.get(r.text) ?? 0;
    if (Number(r.at) > prev) best.set(r.text, Number(r.at));
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text]) => text);
}

/** A tag that changes whenever the plan a display sees does, so displays can poll with If-None-Match. */
export const planTag = (body: unknown) => `"meals-${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;

export type { MealOrigin, MealOrigins, MealRule, MealRepeat };
