import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CalendarData, CalendarEvent } from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";

import { cached, forget, type Cached } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Google Calendar (Melvin, 2026-11-17: the full calendar, a today schedule and a month view). An admin connects a
// Google account once from the admin panel (OAuth, read-only calendar scope); the refresh token is stored encrypted
// and never leaves the server. The server fetches the chosen calendars' events, trims them and caches them for five
// minutes, so every display shares one small feed.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
export const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
// Google Photos through Google's own picker (Melvin, 2026-11-17): the admin picks photos in Google's window and we copy
// them into our library. Asked for only when the admin connects Google Photos.
export const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
// Google Tasks (Melvin, 2026-11-17, in place of Google Keep, which has no API for personal accounts): read the lists and
// tick tasks off from the wall. Asked for only when the admin connects Google Tasks (src/server/googleTasks.ts).
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
// The account owner's name (Melvin, 2026-11-26: "one of my calendars just shows my email, can you see if you can get my
// name instead?"). A Google primary calendar is named after the account's email, so the wall's calendar chip read
// "someone@gmail.com". Asked for on every connection; an account connected before this keeps its email until it is
// connected again or the calendar is renamed in Settings.
export const PROFILE_SCOPE = "https://www.googleapis.com/auth/userinfo.profile";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const STATE_COOKIE = "ep_google_state";
const TTL = 5 * 60_000;

export const googleConfigured = () => Boolean(env.googleClientId() && env.googleClientSecret());

/** Where Google sends the admin back. Must match the redirect URI registered on the OAuth client. */
export const redirectUri = (origin: string) => `${env.siteUrl() || origin}/api/google/callback/`;

export function consentUrl(state: string, redirect: string, photos = false, tasks = false, gmail = false): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: redirect,
    response_type: "code",
    scope: [SCOPE, PROFILE_SCOPE, ...(photos ? [PHOTOS_SCOPE] : []), ...(tasks ? [TASKS_SCOPE] : []), ...(gmail ? [GMAIL_SCOPE] : [])].join(
      " ",
    ),
    // offline + consent: Google returns a refresh token every time, even when the account was connected before.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export const newState = () => randomToken(24);

export function stateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/api/google/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export const clearedStateCookie = () => `${STATE_COOKIE}=; Path=/api/google/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Thrown when Google no longer accepts the stored token (revoked, or the account's password changed). */
export class GoogleDisconnected extends Error {
  constructor() {
    super("Google Calendar needs to be connected again");
  }
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

async function tokenRequest(params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId(), client_secret: env.googleClientSecret(), ...params }),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 400 || r.status === 401) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new GoogleDisconnected();
    throw new Error(`Google refused the request (${body.error ?? r.status})`);
  }
  if (!r.ok) throw new Error(`Google answered ${r.status}`);
  return tokenSchema.parse(await r.json());
}

const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

/** The Google account's own name, or "" when the profile scope wasn't granted or Google didn't answer. */
async function ownerName(token: string): Promise<string> {
  try {
    const r = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return "";
    const body = z.object({ name: z.string().optional() }).safeParse(await r.json());
    return body.success ? (body.data.name ?? "").trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The name a calendar goes by on the wall: the owner's name in place of an email address, but only while the name is
 * still the calendar's own id (Google's default for a primary calendar). A name typed in Settings always wins.
 */
export function calendarName(calendar: { id: string; name: string }, owner: string | null | undefined): string {
  const name = calendar.name.trim() || calendar.id;
  return owner && name === calendar.id && EMAIL.test(name) ? owner : name;
}

/** Trades the one-time code from the consent screen for a refresh token and stores it. */
export async function connect(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!t.refresh_token) throw new Error("Google didn't send a refresh token");
  await setSecret(accountId, "google.refreshToken", t.refresh_token, now);
  await setSecret(accountId, "google.scopes", t.scope ?? SCOPE, now);
  await setSecret(accountId, "google.name", (await ownerName(t.access_token)) || null, now);
  access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
  await forget("calendar:");
  await forget("tasks:");
  await forget("gmail:");
}

export async function disconnect(accountId: string): Promise<void> {
  const refresh = await getSecret(accountId, "google.refreshToken");
  access.delete(accountId);
  await setSecret(accountId, "google.refreshToken", null);
  await setSecret(accountId, "google.scopes", null);
  await setSecret(accountId, "google.name", null);
  await forget("calendar:");
  await forget("tasks:");
  await forget("gmail:");
  if (refresh) {
    // Best effort: the token is already gone from our side either way.
    await fetch(`${REVOKE_URL}?${new URLSearchParams({ token: refresh })}`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(
      () => undefined,
    );
  }
}

/** Whether the connected Google account allowed Google Photos picking. */
export async function photosGranted(accountId: string): Promise<boolean> {
  return Boolean(
    (await getSecret(accountId, "google.refreshToken")) && (await getSecret(accountId, "google.scopes"))?.split(" ").includes(PHOTOS_SCOPE),
  );
}

/** Whether the connected Google account allowed Google Tasks. */
export async function tasksGranted(accountId: string): Promise<boolean> {
  return Boolean(
    (await getSecret(accountId, "google.refreshToken")) && (await getSecret(accountId, "google.scopes"))?.split(" ").includes(TASKS_SCOPE),
  );
}

export async function gmailReadGranted(accountId: string): Promise<boolean> {
  return Boolean(
    (await getSecret(accountId, "google.refreshToken")) && (await getSecret(accountId, "google.scopes"))?.split(" ").includes(GMAIL_SCOPE),
  );
}

export async function accessToken(accountId: string, now = Date.now()): Promise<string> {
  const refresh = await getSecret(accountId, "google.refreshToken");
  if (!refresh) throw new GoogleDisconnected();
  const held = access.get(accountId);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.token;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh });
    return t.access_token;
  } catch (error) {
    if (error instanceof GoogleDisconnected) access.delete(accountId);
    throw error;
  }
}

async function api(accountId: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = await accessToken(accountId);
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${API}${path}${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401) {
    access.delete(accountId);
    throw new Error("Google refused the access token");
  }
  if (!r.ok) throw new Error(`Google Calendar answered ${r.status}`);
  return r.json() as Promise<unknown>;
}

// ---- Calendars ----

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        backgroundColor: z.string().optional(),
        primary: z.boolean().optional(),
        selected: z.boolean().optional(),
      }),
    )
    .default([]),
});

export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

const hexColour = (c: string | undefined, fallback = "#3b5bdb") => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : fallback);

export function trimCalendars(raw: unknown, owner?: string | null): GoogleCalendar[] {
  return calendarListSchema
    .parse(raw)
    .items.map((c) => ({
      id: c.id,
      name: calendarName({ id: c.id, name: (c.summaryOverride ?? c.summary ?? c.id).slice(0, 120) }, owner),
      color: hexColour(c.backgroundColor),
      primary: c.primary === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function listCalendars(accountId: string): Promise<GoogleCalendar[]> {
  const raw = await api(accountId, "/users/me/calendarList", { minAccessRole: "reader", maxResults: "250" });
  return trimCalendars(raw, await getSecret(accountId, "google.name"));
}

// ---- Events ----

const eventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
});
const eventsSchema = z.object({ items: z.array(z.unknown()).default([]), nextPageToken: z.string().optional() });

/** One Google event as a display draws it, or null for cancelled or malformed ones. */
export function trimEvent(raw: unknown, calendar: { name: string; color: string }): CalendarEvent | null {
  const e = eventSchema.safeParse(raw);
  if (!e.success || e.data.status === "cancelled") return null;
  const { start, end } = e.data;
  const allDay = Boolean(start?.date);
  const s = start?.dateTime ?? start?.date;
  if (!s) return null;
  const en = end?.dateTime ?? end?.date ?? s;
  return {
    id: e.data.id,
    title: (e.data.summary ?? "Busy").slice(0, 120),
    start: s,
    end: en,
    allDay,
    color: calendar.color,
    calendar: calendar.name,
    ...(e.data.location ? { location: e.data.location.slice(0, 80) } : {}),
  };
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const localDate = (now: number, timeZone: string) =>
  zonedFormatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/**
 * The days one feed covers: the whole month grid around today (a week either side of the month) and at least the
 * next six weeks (the most a month widget can show from this week), so the month view and the schedule share one fetch.
 */
export function feedRange(now: number, timeZone: string): { from: string; to: string; today: string } {
  const today = localDate(now, timeZone);
  const first = `${today.slice(0, 8)}01`;
  const nextMonth = addDays(first, 32).slice(0, 8) + "01";
  const from = addDays(first, -7);
  const monthEnd = addDays(nextMonth, 7);
  const sixWeeks = addDays(today, 43);
  return { from, to: monthEnd > sixWeeks ? monthEnd : sixWeeks, today };
}

async function eventsFor(
  accountId: string,
  calendar: { id: string; name: string; color: string },
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  // A day's margin either side covers every time zone; the display places events by its own zone.
  const params = {
    timeMin: `${addDays(from, -1)}T00:00:00Z`,
    timeMax: `${addDays(to, 1)}T00:00:00Z`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: "items(id,status,summary,location,start,end),nextPageToken",
  };
  for (let page = 0; page < 4; page++) {
    const body = eventsSchema.parse(
      await api(accountId, `/calendars/${encodeURIComponent(calendar.id)}/events`, pageToken ? { ...params, pageToken } : params),
    );
    for (const raw of body.items) {
      const e = trimEvent(raw, calendar);
      if (e) out.push(e);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Sorts events the way every view lists them: all-day first on a day, then by start time. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  const key = (e: CalendarEvent) => (e.allDay ? `${e.start}T00:00:00Z` : new Date(e.start).toISOString());
  return [...events].sort((a, b) => key(a).localeCompare(key(b)) || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title));
}

export async function calendarFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<CalendarData>> {
  // Checked first, so a revoked connection shows as such instead of the last cached events living on forever.
  await accessToken(accountId, now);
  const owner = await getSecret(accountId, "google.name");
  const calendars = config.integrations.google.calendars.filter((c) => c.enabled).map((c) => ({ ...c, name: calendarName(c, owner) }));
  const { from, to } = feedRange(now, config.location.timeZone);
  // The name is in the key so a calendar renamed in Settings shows its new name on the next read, not in five minutes.
  const key = `calendar:${accountId}:${from}:${calendars.map((c) => `${c.id}=${c.color}=${c.name}`).join(",")}`;
  return cached(
    key,
    TTL,
    async () => {
      const lists = await Promise.all(calendars.map((c) => eventsFor(accountId, c, from, to)));
      return { updatedAt: now, from, to, events: sortEvents(lists.flat()).slice(0, 600) };
    },
    now,
  );
}

/** Tests only. */
export function resetGoogleForTests(): void {
  access.clear();
}
