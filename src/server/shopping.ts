import "server-only";

import { createHash } from "node:crypto";

import { localDate } from "@/lib/calendar";
import type { DashboardConfig } from "@/lib/config/schema";
import type { ShoppingData, ShoppingItem } from "@/lib/display/types";
import { MEAL_SLOTS } from "@/lib/meals";
import { isShoppingCategory, type ShoppingCategory } from "@/lib/shopping";
import { guessCategory } from "@/lib/shoppingGuess";

import { markChanged } from "./changes";
import { randomToken } from "./crypto";
import { query, run } from "./db";
import { mealsBetween } from "./meals";

// The family shopping list (Melvin, 2026-11-22): items added from phones, shown on the wall, and ticked off there only
// when a shopping widget allows taps, because anyone in the kitchen can reach the screen. Bought items stay for a week
// so they can be cleared or shown, then they're deleted as the list is read or written, so no cron job is needed.
// Each item has an aisle and can be marked "running low" (Melvin, 2026-11-26): the aisle is guessed from the words
// until someone picks one on a phone, and a picked aisle is reused the next time the same item is added.

export const ITEM_MAX = 80;
/** Open items, not bought ones. A hundred lines is a long grocery run; past that, tick some off or remove them. */
export const OPEN_MAX = 100;
const KEEP_DAYS = 7;
const DAY = 86_400_000;

type Row = {
  id: string;
  text: string;
  done: number | bigint;
  sort: number | bigint;
  added_at: number | bigint;
  done_at: number | bigint | null;
  category: string | null;
  low: number | bigint | null;
};

const categoryOf = (r: { text: string; category: string | null }): ShoppingCategory =>
  isShoppingCategory(r.category) ? r.category : guessCategory(r.text);

const itemOf = (r: Row): ShoppingItem => ({
  id: r.id,
  text: r.text,
  done: Number(r.done) === 1,
  category: categoryOf(r),
  low: Number(r.low ?? 0) === 1,
});

const norm = (text: string) => text.trim().replace(/\s+/g, " ");
const keyOf = (text: string) => norm(text).toLocaleLowerCase("en-CA").normalize("NFC");

async function prune(accountId: string, now: number): Promise<void> {
  await run("DELETE FROM shopping WHERE account_id = ? AND done = 1 AND done_at IS NOT NULL AND done_at < ?", [
    accountId,
    now - KEEP_DAYS * DAY,
  ]);
}

/**
 * Open items first, in the order they were added, then bought ones from the last week (a phone clears them, and a
 * widget can show them). Older bought items are deleted here.
 */
export async function listShopping(accountId: string, now = Date.now()): Promise<ShoppingData> {
  await prune(accountId, now);
  const rows = await query<Row>(
    "SELECT id, text, done, sort, added_at, done_at, category, low FROM shopping WHERE account_id = ? ORDER BY done ASC, sort ASC",
    [accountId],
  );
  let updatedAt = 0;
  const items = rows.map((r) => {
    updatedAt = Math.max(updatedAt, Number(r.added_at), r.done_at == null ? 0 : Number(r.done_at));
    return itemOf(r);
  });
  return { updatedAt, items };
}

export async function addShoppingItem(
  accountId: string,
  input: { text: string; by: string; category?: ShoppingCategory | undefined; low?: boolean | undefined },
  now = Date.now(),
): Promise<{ ok: true; item: ShoppingItem } | { ok: false; error: "empty" | "long" | "full" }> {
  const text = norm(input.text);
  if (!text) return { ok: false, error: "empty" };
  if (text.length > ITEM_MAX) return { ok: false, error: "long" };
  await prune(accountId, now);
  const open = await query<{ n: number | bigint }>("SELECT COUNT(*) AS n FROM shopping WHERE account_id = ? AND done = 0", [accountId]);
  if (Number(open[0]?.n ?? 0) >= OPEN_MAX) return { ok: false, error: "full" };
  const max = await query<{ n: number | bigint }>("SELECT COALESCE(MAX(sort), 0) AS n FROM shopping WHERE account_id = ?", [accountId]);
  const id = randomToken(9);
  // An aisle someone picked for this item before (still in the last week's list) beats the guess.
  const category = input.category ?? (await pickedCategory(accountId, text));
  const low = input.low === true;
  await run(
    "INSERT INTO shopping (id, account_id, text, done, sort, added_at, done_at, added_by, category, low) VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, ?)",
    [id, accountId, text, Number(max[0]?.n ?? 0) + 1, now, input.by, category ?? null, low ? 1 : 0],
  );
  await markChanged(accountId, "shopping");
  return { ok: true, item: { id, text, done: false, category: category ?? guessCategory(text), low } };
}

async function pickedCategory(accountId: string, text: string): Promise<ShoppingCategory | undefined> {
  const rows = await query<Pick<Row, "text" | "category">>(
    "SELECT text, category FROM shopping WHERE account_id = ? AND category IS NOT NULL ORDER BY added_at DESC, sort DESC",
    [accountId],
  );
  // SQLite lower() only folds ASCII. Apply the same normalization to both grocery names.
  const key = keyOf(text);
  const picked = rows.find((row) => keyOf(row.text) === key)?.category;
  return isShoppingCategory(picked) ? picked : undefined;
}

/**
 * Moves an item to another aisle or marks it running low, from a phone. Moving it also moves every other row with the
 * same words, so a bought "oat milk" put back later stays where it was put.
 */
export async function updateShoppingItem(
  accountId: string,
  input: { id: string; category?: ShoppingCategory | undefined; low?: boolean | undefined },
): Promise<"ok" | "not-found"> {
  const rows = await query<Pick<Row, "id" | "text">>("SELECT id, text FROM shopping WHERE account_id = ? AND (id = ? OR ?)", [
    accountId,
    input.id,
    input.category ? 1 : 0,
  ]);
  const row = rows.find((item) => item.id === input.id);
  if (!row) return "not-found";
  const key = keyOf(row.text);
  const ids = rows.filter((item) => keyOf(item.text) === key).map((item) => item.id);
  await run(
    `UPDATE shopping SET category = COALESCE(?, category), low = CASE WHEN id = ? THEN COALESCE(?, low) ELSE low END
     WHERE account_id = ? AND id IN (SELECT value FROM json_each(?))`,
    [input.category ?? null, input.id, input.low === undefined ? null : Number(input.low), accountId, JSON.stringify(ids)],
  );
  await markChanged(accountId, "shopping");
  return "ok";
}

async function writeDone(accountId: string, id: string, done: boolean, now: number): Promise<"ok" | "not-found"> {
  await prune(accountId, now);
  const rows = await query<{ id: string }>("SELECT id FROM shopping WHERE account_id = ? AND id = ?", [accountId, id]);
  if (!rows[0]) return "not-found";
  if (done) await run("UPDATE shopping SET done = 1, done_at = ? WHERE account_id = ? AND id = ?", [now, accountId, id]);
  else await run("UPDATE shopping SET done = 0, done_at = NULL WHERE account_id = ? AND id = ?", [accountId, id]);
  await markChanged(accountId, "shopping");
  return "ok";
}

/**
 * A tap on the wall: ticks an item off or puts it back. Only when some shopping widget has allowCheck, the same rule
 * as chores (Melvin, 2026-11-22). A signed-in phone uses setShoppingDoneFromPhone instead.
 */
export async function setShoppingDone(
  accountId: string,
  config: DashboardConfig,
  input: { id: string; done: boolean },
  now = Date.now(),
): Promise<"ok" | "forbidden" | "not-found"> {
  const allowed = config.views.some((v) => v.widgets.some((w) => w.type === "shopping" && w.allowCheck));
  if (!allowed) return "forbidden";
  return writeDone(accountId, input.id, input.done, now);
}

/** Adds one line from the wall when a shopping widget allows it (Melvin, 2026-11-23). */
export async function addShoppingFromWall(
  accountId: string,
  config: DashboardConfig,
  input: { text: string; low?: boolean | undefined },
  by = "wall",
  now = Date.now(),
): Promise<{ ok: true; item: ShoppingItem } | { ok: false; error: "forbidden" | "empty" | "long" | "full" }> {
  const allowed = config.views.some((v) => v.widgets.some((w) => w.type === "shopping" && w.allowAdd));
  if (!allowed) return { ok: false, error: "forbidden" };
  const result = await addShoppingItem(accountId, { text: input.text, by, low: input.low }, now);
  if (!result.ok) return { ok: false, error: result.error };
  return result;
}

/** A signed-in person on their phone may always tick an item. The kitchen screen goes through setShoppingDone. */
export async function setShoppingDoneFromPhone(
  accountId: string,
  input: { id: string; done: boolean },
  now = Date.now(),
): Promise<"ok" | "not-found"> {
  return writeDone(accountId, input.id, input.done, now);
}

export async function removeShoppingItem(accountId: string, id: string): Promise<boolean> {
  const removed = (await run("DELETE FROM shopping WHERE account_id = ? AND id = ?", [accountId, id])) > 0;
  if (removed) await markChanged(accountId, "shopping");
  return removed;
}

export async function clearDoneShopping(accountId: string): Promise<number> {
  const removed = await run("DELETE FROM shopping WHERE account_id = ? AND done = 1", [accountId]);
  if (removed > 0) await markChanged(accountId, "shopping");
  return removed;
}

/**
 * Copies this week's meals onto the list (Melvin, 2026-11-22): the next 7 days, each distinct non-empty meal that
 * isn't already open. "Tacos" and "tacos" are the same item. A meal longer than a shopping line is cut to fit.
 * Returns how many were added; a full list stops the rest.
 */
export async function addShoppingFromMeals(accountId: string, config: DashboardConfig, by = "meals"): Promise<number> {
  const now = Date.now();
  const today = localDate(now, config.location.timeZone);
  const plan = await mealsBetween(accountId, today, 7);
  const open = await query<{ text: string }>("SELECT text FROM shopping WHERE account_id = ? AND done = 0", [accountId]);
  const seen = new Set(open.map((r) => keyOf(r.text)));
  let added = 0;
  for (const date of Object.keys(plan).sort()) {
    const day = plan[date];
    if (!day) continue;
    for (const slot of MEAL_SLOTS) {
      const text = norm(day[slot] ?? "").slice(0, ITEM_MAX);
      const key = keyOf(text);
      if (!text || seen.has(key)) continue;
      const result = await addShoppingItem(accountId, { text, by }, now);
      if (!result.ok) {
        if (result.error === "full") return added;
        continue;
      }
      seen.add(key);
      added++;
    }
  }
  return added;
}

/** A tag that changes whenever the list a display sees does, so displays can poll with If-None-Match. */
export const shoppingTag = (body: unknown) =>
  `"shopping-${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;
