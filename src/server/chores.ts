import "server-only";

import { createHash } from "node:crypto";

import { addDays, localDate } from "@/lib/calendar";
import { dueOn, weekStart } from "@/lib/chores";
import type { DashboardConfig } from "@/lib/config/schema";
import type { ChoresData } from "@/lib/display/types";

import { query, run } from "./db";

// The chore chart (Melvin, 2026-11-21): the chores themselves are in the settings document (config.chores); this keeps
// who ticked what off, one row per day, chore and person. The stars a chore was worth are kept on its row, so changing
// a chore's stars later doesn't rewrite last week. Rows older than KEEP_DAYS are cleared as new ones are written.

const KEEP_DAYS = 60;

type Row = { date: string; chore_id: string; person_id: string; stars: number };

/** Today's chart for the chores widget, in the dashboard's time zone. */
export async function choreBoard(config: DashboardConfig, now = Date.now()): Promise<ChoresData> {
  const today = localDate(now, config.location.timeZone);
  const { people, items } = config.chores;
  const due = dueOn(people, items, today);
  const monday = weekStart(today);
  const rows = await query<Row>("SELECT date, chore_id, person_id, stars FROM chores_done WHERE date >= ? AND date <= ?", [monday, today]);
  const stars = new Map<string, number>();
  for (const r of rows) stars.set(r.person_id, (stars.get(r.person_id) ?? 0) + Number(r.stars));
  const done = new Set(rows.filter((r) => r.date === today).map((r) => `${r.chore_id}|${r.person_id}`));
  const dueIds = new Set(due.map((d) => d.choreId));
  return {
    today,
    people: people.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, goal: p.goal, stars: stars.get(p.id) ?? 0 })),
    chores: items.filter((c) => dueIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, stars: c.stars })),
    due: due.map((d) => ({ ...d, done: done.has(`${d.choreId}|${d.personId}`) })),
  };
}

/**
 * A tap on the wall: ticks a chore off for one person today, or takes the tick back. Only a chore that is theirs today,
 * and only when a chores widget that allows ticking shows that person.
 */
export async function setChoreDone(
  config: DashboardConfig,
  input: { chore: string; person: string; done: boolean },
  now = Date.now(),
): Promise<"ok" | "forbidden"> {
  const allowed = config.views.some((v) =>
    v.widgets.some((w) => w.type === "chores" && w.allowCheck && (w.personIds.length === 0 || w.personIds.includes(input.person))),
  );
  const today = localDate(now, config.location.timeZone);
  const chore = config.chores.items.find((c) => c.id === input.chore);
  const isDue = dueOn(config.chores.people, config.chores.items, today).some(
    (d) => d.choreId === input.chore && d.personId === input.person,
  );
  if (!allowed || !chore || !isDue) return "forbidden";
  if (input.done) {
    await run(
      `INSERT INTO chores_done (date, chore_id, person_id, stars, done_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (date, chore_id, person_id) DO NOTHING`,
      [today, chore.id, input.person, chore.stars, now],
    );
    await run("DELETE FROM chores_done WHERE date < ?", [addDays(today, -KEEP_DAYS)]);
  } else {
    await run("DELETE FROM chores_done WHERE date = ? AND chore_id = ? AND person_id = ?", [today, chore.id, input.person]);
  }
  return "ok";
}

/** A tag that changes whenever the chart a display sees does, so displays can poll with If-None-Match. */
export const choresTag = (body: unknown) =>
  `"chores-${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;
