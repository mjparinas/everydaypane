import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CalendarData, CalendarEvent } from "@/lib/display/types";

import { cached, forget, type Cached } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import { calendarName, feedRange, sortEvents } from "./google";
import { getSecret, setSecret } from "./secrets";

// Microsoft 365 calendars (Melvin, 2026-11-23): read-only OAuth through Microsoft Graph, merged into the same
// display feed as Google Calendar and iCal links.

const BASE_SCOPES = ["offline_access", "Calendars.Read"];
export const FILES_SCOPE = "Files.Read";
export const TODO_SCOPE = "Tasks.ReadWrite";
const GRAPH = "https://graph.microsoft.com/v1.0";
const TTL = 5 * 60_000;
export const STATE_COOKIE = "ep_microsoft_state";

export const microsoftConfigured = () => Boolean(env.microsoftClientId() && env.microsoftClientSecret());

function tenant() {
  return env.microsoftTenant() || "common";
}

function authBase() {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}

export const redirectUri = (origin: string) => `${env.siteUrl() || origin}/api/microsoft/callback/`;

export function consentUrl(state: string, redirect: string, extra: { files?: boolean; todo?: boolean } = {}): string {
  const scopes = [...BASE_SCOPES, ...(extra.files ? [FILES_SCOPE] : []), ...(extra.todo ? [TODO_SCOPE] : [])];
  const p = new URLSearchParams({
    client_id: env.microsoftClientId(),
    redirect_uri: redirect,
    response_type: "code",
    scope: scopes.join(" "),
    response_mode: "query",
    state,
  });
  return `${authBase()}/authorize?${p}`;
}

export const newState = () => randomToken(24);

export function stateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/api/microsoft/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export const clearedStateCookie = () => `${STATE_COOKIE}=; Path=/api/microsoft/; HttpOnly; SameSite=Lax; Max-Age=0`;

export class MicrosoftDisconnected extends Error {
  constructor() {
    super("Microsoft 365 needs to be connected again");
  }
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

async function tokenRequest(params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
  const r = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.microsoftClientId(), client_secret: env.microsoftClientSecret(), ...params }),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 400 || r.status === 401) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new MicrosoftDisconnected();
    throw new Error(`Microsoft refused the request (${body.error ?? r.status})`);
  }
  if (!r.ok) throw new Error(`Microsoft answered ${r.status}`);
  return tokenSchema.parse(await r.json());
}

const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

export async function connect(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!t.refresh_token) throw new Error("Microsoft didn't send a refresh token");
  await setSecret(accountId, "microsoft.refreshToken", t.refresh_token, now);
  if (t.scope) await setSecret(accountId, "microsoft.scopes", t.scope, now);
  access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
  await forget("calendar:");
  await forget("tasks:");
}

export async function disconnect(accountId: string): Promise<void> {
  access.delete(accountId);
  await setSecret(accountId, "microsoft.refreshToken", null);
  await forget("calendar:");
}

export async function accessToken(accountId: string, now = Date.now()): Promise<string> {
  const refresh = await getSecret(accountId, "microsoft.refreshToken");
  if (!refresh) throw new MicrosoftDisconnected();
  const held = access.get(accountId);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.token;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh });
    return t.access_token;
  } catch (error) {
    if (error instanceof MicrosoftDisconnected) access.delete(accountId);
    throw error;
  }
}

async function graph(accountId: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = await accessToken(accountId);
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${GRAPH}${path}${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401) {
    access.delete(accountId);
    throw new Error("Microsoft refused the access token");
  }
  if (!r.ok) throw new Error(`Microsoft Graph answered ${r.status}`);
  return r.json() as Promise<unknown>;
}

const calendarListSchema = z.object({
  value: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        isDefaultCalendar: z.boolean().optional(),
      }),
    )
    .default([]),
});

export interface MicrosoftCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

const hexColour = (c: string | undefined, fallback = "#2563eb") => {
  if (c && /^#[0-9a-fA-F]{6}$/i.test(c)) return c.toLowerCase();
  const map: Record<string, string> = {
    auto: fallback,
    lightBlue: "#1c7ed6",
    lightGreen: "#2f9e44",
    lightOrange: "#e8590c",
    lightGray: "#495057",
    lightYellow: "#fab005",
    lightTeal: "#0ca678",
    lightPink: "#d6336c",
    lightBrown: "#8d5524",
    lightRed: "#e03131",
    maxColor: fallback,
  };
  return map[c ?? ""] ?? fallback;
};

export function trimCalendars(raw: unknown): MicrosoftCalendar[] {
  return calendarListSchema
    .parse(raw)
    .value.map((c) => ({
      id: c.id,
      name: (c.name ?? c.id).slice(0, 120),
      color: hexColour(c.color),
      primary: c.isDefaultCalendar === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function listCalendars(accountId: string): Promise<MicrosoftCalendar[]> {
  return trimCalendars(await graph(accountId, "/me/calendars"));
}

const eventSchema = z.object({
  id: z.string(),
  subject: z.string().optional(),
  location: z.object({ displayName: z.string().optional() }).optional(),
  isCancelled: z.boolean().optional(),
  isAllDay: z.boolean().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
});
const eventsSchema = z.object({ value: z.array(z.unknown()).default([]) });

function trimEvent(raw: unknown, calendar: { name: string; color: string }): CalendarEvent | null {
  const e = eventSchema.safeParse(raw);
  if (!e.success || e.data.isCancelled) return null;
  const allDay = e.data.isAllDay === true || Boolean(e.data.start?.date);
  const s = e.data.start?.dateTime ?? e.data.start?.date;
  if (!s) return null;
  const en = e.data.end?.dateTime ?? e.data.end?.date ?? s;
  const start = allDay ? s.slice(0, 10) : new Date(s).toISOString();
  const end = allDay ? (e.data.end?.date ?? s).slice(0, 10) : new Date(en).toISOString();
  return {
    id: e.data.id,
    title: (e.data.subject ?? "Busy").slice(0, 120),
    start,
    end,
    allDay,
    color: calendar.color,
    calendar: calendar.name,
    ...(e.data.location?.displayName ? { location: e.data.location.displayName.slice(0, 80) } : {}),
  };
}

async function eventsFor(
  accountId: string,
  calendar: { id: string; name: string; color: string },
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const body = eventsSchema.parse(
    await graph(accountId, `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`, {
      startDateTime: `${from}T00:00:00`,
      endDateTime: `${to}T23:59:59`,
      $top: "250",
      $orderby: "start/dateTime",
    }),
  );
  const out: CalendarEvent[] = [];
  for (const raw of body.value) {
    const e = trimEvent(raw, calendar);
    if (e) out.push(e);
  }
  return out;
}

export async function microsoftFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<CalendarData>> {
  await accessToken(accountId, now);
  const calendars = config.integrations.microsoft.calendars.filter((c) => c.enabled).map((c) => ({ ...c, name: calendarName(c, null) }));
  const { from, to } = feedRange(now, config.location.timeZone);
  const key = `m365:${accountId}:${from}:${calendars.map((c) => `${c.id}=${c.color}=${c.name}`).join(",")}`;
  return cached(
    key,
    TTL,
    async () => {
      const lists = await Promise.all(calendars.map((c) => eventsFor(accountId, c, from, to)));
      return { updatedAt: now, from, to, events: sortEvents(lists.flat()).slice(0, 400) };
    },
    now,
  );
}

export function resetMicrosoftForTests(): void {
  access.clear();
}
