import "server-only";

import { createHash } from "node:crypto";

import { addDays, localDate } from "@/lib/calendar";
import { dueOn, weekStart } from "@/lib/chores";
import type { DashboardConfig } from "@/lib/config/schema";
import type { ChoresData } from "@/lib/display/types";

import { markChanged } from "./changes";
import { verifyChoresPin } from "./chorePin";
import { randomToken } from "./crypto";
import { query, run } from "./db";

// The chore chart (Melvin, 2026-11-21): the chores themselves are in the settings document (config.chores); this keeps
// who ticked what off, one row per day, chore and person. The stars a chore was worth are kept on its row, so changing
// a chore's stars later doesn't rewrite last week. Rows older than KEEP_DAYS are cleared as new ones are written.

const KEEP_DAYS = 60;

type Row = { date: string; chore_id: string; person_id: string; stars: number };

type RedeemRow = { stars_cost: number };

async function redeemedThisWeek(accountId: string, monday: string, today: string, now: number): Promise<Map<string, number>> {
  const start = Date.parse(`${monday}T00:00:00Z`);
  const end = now + 86_400_000;
  const rows = await query<RedeemRow & { person_id: string }>(
    "SELECT person_id, stars_cost FROM chore_redemptions WHERE account_id = ? AND redeemed_at >= ? AND redeemed_at < ?",
    [accountId, start, end],
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.person_id, (map.get(r.person_id) ?? 0) + Number(r.stars_cost));
  return map;
}

/** Today's chart for the chores widget, in the dashboard's time zone. */
export async function choreBoard(accountId: string, config: DashboardConfig, now = Date.now()): Promise<ChoresData> {
  const today = localDate(now, config.location.timeZone);
  const { people, items, rewards, pinSet } = config.chores;
  const due = dueOn(people, items, today);
  const monday = weekStart(today);
  const rows = await query<Row>(
    "SELECT date, chore_id, person_id, stars FROM account_chores_done WHERE account_id = ? AND date >= ? AND date <= ?",
    [accountId, monday, today],
  );
  const stars = new Map<string, number>();
  for (const r of rows) stars.set(r.person_id, (stars.get(r.person_id) ?? 0) + Number(r.stars));
  const spent = await redeemedThisWeek(accountId, monday, today, now);
  const done = new Set(rows.filter((r) => r.date === today).map((r) => `${r.chore_id}|${r.person_id}`));
  const dueIds = new Set(due.map((d) => d.choreId));
  return {
    today,
    pinSet,
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, starsCost: r.starsCost })),
    people: people.map((p) => {
      const earned = stars.get(p.id) ?? 0;
      const available = Math.max(0, earned - (spent.get(p.id) ?? 0));
      return { id: p.id, name: p.name, emoji: p.emoji, color: p.color, goal: p.goal, stars: earned, available };
    }),
    chores: items
      .filter((c) => dueIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, stars: c.stars, period: c.period })),
    due: due.map((d) => ({ ...d, done: done.has(`${d.choreId}|${d.personId}`) })),
  };
}

function wallCheckAllowed(config: DashboardConfig, personId: string): boolean {
  return config.views.some((v) =>
    v.widgets.some((w) => w.type === "chores" && w.allowCheck && (w.personIds.length === 0 || w.personIds.includes(personId))),
  );
}

/**
 * A tap on the wall or kids phone page: ticks a chore off for one person today, or takes the tick back. Only a chore
 * that is theirs today. Wall taps also need a chores widget with `allowCheck` for that person; the kids phone page
 * (`fromPhone`) skips that so kids can tick without the kitchen screen allowing it (Melvin, 2026-11-23).
 */
export async function setChoreDone(
  accountId: string,
  config: DashboardConfig,
  input: { chore: string; person: string; done: boolean; pin?: string; fromPhone?: boolean },
  now = Date.now(),
): Promise<"ok" | "forbidden" | "pin"> {
  const allowed = input.fromPhone || wallCheckAllowed(config, input.person);
  const today = localDate(now, config.location.timeZone);
  const chore = config.chores.items.find((c) => c.id === input.chore);
  const isDue = dueOn(config.chores.people, config.chores.items, today).some(
    (d) => d.choreId === input.chore && d.personId === input.person,
  );
  if (!allowed || !chore || !isDue) return "forbidden";
  if (!input.done && config.chores.pinSet) {
    const pin = input.pin ?? "";
    if (!(await verifyChoresPin(accountId, pin))) return "pin";
  }
  if (input.done) {
    await run(
      `INSERT INTO account_chores_done (account_id, date, chore_id, person_id, stars, done_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, date, chore_id, person_id) DO NOTHING`,
      [accountId, today, chore.id, input.person, chore.stars, now],
    );
    await run("DELETE FROM account_chores_done WHERE account_id = ? AND date < ?", [accountId, addDays(today, -KEEP_DAYS)]);
  } else {
    await run("DELETE FROM account_chores_done WHERE account_id = ? AND date = ? AND chore_id = ? AND person_id = ?", [
      accountId,
      today,
      chore.id,
      input.person,
    ]);
  }
  await markChanged(accountId, "chores");
  return "ok";
}

/** Redeems a reward for one person when they have enough stars (wall needs allowCheck; kids phone skips that). */
export async function redeemChoreReward(
  accountId: string,
  config: DashboardConfig,
  input: { reward: string; person: string; pin?: string; fromPhone?: boolean },
  now = Date.now(),
): Promise<"ok" | "forbidden" | "pin" | "stars"> {
  const allowed = input.fromPhone || wallCheckAllowed(config, input.person);
  const reward = config.chores.rewards.find((r) => r.id === input.reward);
  const person = config.chores.people.find((p) => p.id === input.person);
  if (!allowed || !reward || !person) return "forbidden";
  if (config.chores.pinSet) {
    const pin = input.pin ?? "";
    if (!(await verifyChoresPin(accountId, pin))) return "pin";
  }
  const today = localDate(now, config.location.timeZone);
  const monday = weekStart(today);
  const board = await choreBoard(accountId, config, now);
  const kid = board.people.find((p) => p.id === input.person);
  if (!kid || kid.available < reward.starsCost) return "stars";
  await run("INSERT INTO chore_redemptions (id, account_id, person_id, reward_id, stars_cost, redeemed_at) VALUES (?, ?, ?, ?, ?, ?)", [
    randomToken(9),
    accountId,
    input.person,
    reward.id,
    reward.starsCost,
    now,
  ]);
  await run("DELETE FROM chore_redemptions WHERE account_id = ? AND redeemed_at < ?", [
    accountId,
    Date.parse(`${monday}T00:00:00Z`) - 60 * 86_400_000,
  ]);
  await markChanged(accountId, "chores");
  return "ok";
}

/** A tag that changes whenever the chart a display sees does, so displays can poll with If-None-Match. */
export const choresTag = (body: unknown) =>
  `"chores-${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;
