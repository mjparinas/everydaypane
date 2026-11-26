import "server-only";

import type { CalendarEvent } from "@/lib/display/types";

import { markChanged } from "./changes";
import { randomToken } from "./crypto";
import { query, run } from "./db";

// Family events (Melvin, 2026-11-22): school concerts, dentist visits and the like, posted from /family/ and merged
// into the same calendar feed as Google and iCal links (colour #5b8def, calendar "Family").

export const FAMILY_COLOUR = "#5b8def";
export const FAMILY_CALENDAR = "Family";

export interface FamilyEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  createdAt: number;
  createdBy: string;
}

type Row = {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: number;
  created_at: number;
  created_by: string;
};

const toEvent = (r: Row): FamilyEvent => ({
  id: r.id,
  title: r.title,
  start: r.start,
  end: r.end,
  allDay: Number(r.all_day) === 1,
  createdAt: Number(r.created_at),
  createdBy: r.created_by,
});

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

/** True when start and end describe a valid family event (end after start). */
export function validSpan(allDay: boolean, start: string, end: string): boolean {
  if (allDay) {
    if (!dateOnly.test(start) || !dateOnly.test(end)) return false;
    return end > start;
  }
  const s = Date.parse(start);
  const e = Date.parse(end);
  return Number.isFinite(s) && Number.isFinite(e) && e > s;
}

export const toCalendar = (e: FamilyEvent): CalendarEvent => ({
  id: `family:${e.id}`,
  title: e.title,
  start: e.start,
  end: e.end,
  allDay: e.allDay,
  color: FAMILY_COLOUR,
  calendar: FAMILY_CALENDAR,
});

/** Events that overlap [from, to) (local inclusive dates, as in feedRange). */
export async function eventsInRange(accountId: string, from: string, to: string): Promise<CalendarEvent[]> {
  const boundStart = `${from}T00:00:00Z`;
  const boundEnd = `${to}T00:00:00Z`;
  const rows = await query<Row>("SELECT * FROM family_events WHERE account_id = ? AND end > ? AND start < ? ORDER BY start", [
    accountId,
    boundStart,
    boundEnd,
  ]);
  return rows.map(toEvent).map(toCalendar);
}

/** Upcoming and recent items for the family page (newest created last in the list, sorted by start). */
export async function listFamilyEvents(accountId: string, limit = 60, now = Date.now()): Promise<FamilyEvent[]> {
  const keepSince = new Date(now - 60 * 86_400_000).toISOString();
  const rows = await query<Row>("SELECT * FROM family_events WHERE account_id = ? AND end > ? ORDER BY start LIMIT ?", [
    accountId,
    keepSince,
    Math.min(Math.max(1, limit), 200),
  ]);
  return rows.map(toEvent);
}

export const MAX_FAMILY_EVENTS = 300;

async function pruneOld(accountId: string, now: number) {
  const cutoff = new Date(now - 90 * 86_400_000).toISOString();
  await run("DELETE FROM family_events WHERE account_id = ? AND end < ?", [accountId, cutoff]);
}

export async function createFamilyEvent(
  accountId: string,
  input: { title: string; start: string; end: string; allDay: boolean; createdBy: string },
  now = Date.now(),
): Promise<FamilyEvent | "invalid"> {
  if (!validSpan(input.allDay, input.start, input.end)) return "invalid";
  const id = randomToken(9);
  await run(
    "INSERT INTO family_events (id, account_id, title, start, end, all_day, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, accountId, input.title, input.start, input.end, input.allDay ? 1 : 0, now, input.createdBy],
  );
  await pruneOld(accountId, now);
  const count = (await query<{ n: number }>("SELECT COUNT(*) AS n FROM family_events WHERE account_id = ?", [accountId]))[0]?.n ?? 0;
  if (count > MAX_FAMILY_EVENTS) {
    const drop = await query<Row>("SELECT id FROM family_events WHERE account_id = ? ORDER BY end ASC LIMIT ?", [
      accountId,
      count - MAX_FAMILY_EVENTS,
    ]);
    for (const r of drop) await run("DELETE FROM family_events WHERE account_id = ? AND id = ?", [accountId, r.id]);
  }
  await markChanged(accountId, "calendar");
  return { id, title: input.title, start: input.start, end: input.end, allDay: input.allDay, createdAt: now, createdBy: input.createdBy };
}

export async function updateFamilyEvent(
  accountId: string,
  id: string,
  input: { title: string; start: string; end: string; allDay: boolean },
  by: { email: string; admin: boolean },
): Promise<"ok" | "not-found" | "forbidden" | "invalid"> {
  const rows = await query<Row>("SELECT * FROM family_events WHERE account_id = ? AND id = ?", [accountId, id]);
  const row = rows[0];
  if (!row) return "not-found";
  if (!by.admin && row.created_by !== by.email) return "forbidden";
  if (!validSpan(input.allDay, input.start, input.end)) return "invalid";
  await run("UPDATE family_events SET title = ?, start = ?, end = ?, all_day = ? WHERE account_id = ? AND id = ?", [
    input.title,
    input.start,
    input.end,
    input.allDay ? 1 : 0,
    accountId,
    id,
  ]);
  await markChanged(accountId, "calendar");
  return "ok";
}

export async function removeFamilyEvent(
  accountId: string,
  id: string,
  by: { email: string; admin: boolean },
): Promise<"ok" | "not-found" | "forbidden"> {
  const rows = await query<Row>("SELECT created_by FROM family_events WHERE account_id = ? AND id = ?", [accountId, id]);
  const row = rows[0];
  if (!row) return "not-found";
  if (!by.admin && row.created_by !== by.email) return "forbidden";
  await run("DELETE FROM family_events WHERE account_id = ? AND id = ?", [accountId, id]);
  await markChanged(accountId, "calendar");
  return "ok";
}
