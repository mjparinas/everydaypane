import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/calendar/route";
import { GET as callbackGET } from "@/app/api/google/callback/route";
import { GET as connectGET } from "@/app/api/google/connect/route";
import { DELETE as adminDELETE, GET as adminGET } from "@/app/api/household/google/route";
import type { CalendarData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { calendarName, consentUrl, feedRange, resetGoogleForTests, trimCalendars, trimEvent } from "./google";
import { getSecret } from "./secrets";

const family = { name: "Family", color: "#3b5bdb" };

describe("Google Calendar data", () => {
  useTestServer({ GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret" });

  it("asks for read-only access and a refresh token", () => {
    const url = new URL(consentUrl("state-1", "https://pane.example/api/google/callback/"));
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe("https://pane.example/api/google/callback/");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("trims events to what a display draws", () => {
    expect(
      trimEvent(
        {
          id: "a",
          summary: "Soccer",
          location: "Willoughby Park",
          start: { dateTime: "2026-11-17T17:00:00-07:00" },
          end: { dateTime: "2026-11-17T18:00:00-07:00" },
        },
        family,
      ),
    ).toEqual({
      id: "a",
      title: "Soccer",
      start: "2026-11-17T17:00:00-07:00",
      end: "2026-11-17T18:00:00-07:00",
      allDay: false,
      color: "#3b5bdb",
      calendar: "Family",
      location: "Willoughby Park",
    });
    expect(trimEvent({ id: "b", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } }, family)).toMatchObject({
      title: "Busy",
      allDay: true,
    });
    expect(trimEvent({ id: "c", status: "cancelled", start: { date: "2026-11-20" } }, family)).toBeNull();
    expect(trimEvent({ id: "d" }, family)).toBeNull();
  });

  it("lists the account's own calendar first", () => {
    const list = trimCalendars({
      items: [
        { id: "holidays", summary: "Holidays in Canada", backgroundColor: "#16A765" },
        { id: "me@example.com", summary: "me@example.com", summaryOverride: "Melvin", primary: true, backgroundColor: "nope" },
      ],
    });
    expect(list).toEqual([
      { id: "me@example.com", name: "Melvin", color: "#3b5bdb", primary: true },
      { id: "holidays", name: "Holidays in Canada", color: "#16a765", primary: false },
    ]);
  });

  it("names a calendar still called by its email after the account's owner", () => {
    const list = trimCalendars(
      {
        items: [
          { id: "me@example.com", summary: "me@example.com", primary: true },
          { id: "holidays", summary: "Holidays in Canada" },
        ],
      },
      "Melvin Parinas",
    );
    expect(list.map((c) => c.name)).toEqual(["Melvin Parinas", "Holidays in Canada"]);
    // A name typed in Settings wins; an empty one falls back; without the owner's name the email stays.
    expect(calendarName({ id: "me@example.com", name: "Dad" }, "Melvin Parinas")).toBe("Dad");
    expect(calendarName({ id: "me@example.com", name: "  " }, "Melvin Parinas")).toBe("Melvin Parinas");
    expect(calendarName({ id: "me@example.com", name: "me@example.com" }, null)).toBe("me@example.com");
    expect(calendarName({ id: "abc@group.calendar.google.com", name: "Soccer" }, "Melvin Parinas")).toBe("Soccer");
  });

  it("covers the month grid around today and the next six weeks", () => {
    const now = Date.parse("2026-11-17T20:00:00Z");
    // Six weeks from this one (Sunday Nov 15 to Saturday Dec 26) reach past the month grid.
    expect(feedRange(now, "America/Vancouver")).toEqual({ from: "2026-10-25", to: "2026-12-30", today: "2026-11-17" });
    expect(feedRange(Date.parse("2026-11-29T20:00:00Z"), "America/Vancouver").to).toBe("2027-01-11");
  });
});

describe("connecting Google Calendar", () => {
  useTestServer({ GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret", NEXT_PUBLIC_SITE_URL: "http://localhost" });

  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let tokenAnswer: () => Response;

  beforeEach(() => {
    resetGoogleForTests();
    clearMemoryCache();
    calls.length = 0;
    tokenAnswer = () => Response.json({ access_token: "access-1", expires_in: 3600, refresh_token: "refresh-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(tokenAnswer());
        if (url.startsWith("https://oauth2.googleapis.com/revoke")) return Promise.resolve(new Response(null, { status: 200 }));
        if (url.startsWith("https://www.googleapis.com/oauth2/v3/userinfo"))
          return Promise.resolve(Response.json({ name: "Melvin Parinas" }));
        if (url.includes("/users/me/calendarList"))
          return Promise.resolve(
            Response.json({
              items: [
                { id: "me@example.com", summary: "Melvin", backgroundColor: "#4986e7", primary: true },
                { id: "holidays", summary: "Holidays in Canada", backgroundColor: "#16a765" },
              ],
            }),
          );
        if (url.includes("/calendars/me%40example.com/events"))
          return Promise.resolve(
            Response.json({
              items: [
                {
                  id: "e2",
                  summary: "Dinner at Lola's",
                  start: { dateTime: "2026-11-17T18:00:00-07:00" },
                  end: { dateTime: "2026-11-17T19:30:00-07:00" },
                },
                { id: "e1", summary: "Pro-D day", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } },
              ],
            }),
          );
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connectAs(cookie: string): Promise<Response> {
    const start = await connectGET(req("/api/google/connect/", { headers: { cookie } }));
    expect(start.status).toBe(303);
    const consent = new URL(start.headers.get("location") ?? "");
    const state = consent.searchParams.get("state") ?? "";
    const stateCookie = (start.headers.get("set-cookie") ?? "").split(";")[0];
    return callbackGET(
      req(`/api/google/callback/?code=one-time-code&state=${state}`, { headers: { cookie: `${cookie}; ${stateCookie}` } }),
    );
  }

  it("connects, stores the token encrypted, and switches on the account's own calendar", async () => {
    const admin = await cookieFor("admin@example.com");
    const done = await connectAs(admin);
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe("/household/?google=connected#settings");

    expect(await getSecret(LEGACY_ACCOUNT_ID, "google.refreshToken")).toBe("refresh-1");
    const tokenCall = calls.find((c) => c.url.startsWith("https://oauth2.googleapis.com/token"));
    expect(String(tokenCall?.init?.body)).toContain("code=one-time-code");
    expect(String(tokenCall?.init?.body)).toContain("redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fgoogle%2Fcallback%2F");

    const { config } = await loadConfig(LEGACY_ACCOUNT_ID);
    expect(config.integrations.google.calendars).toEqual([
      { id: "me@example.com", name: "Melvin", color: "#4986e7", enabled: true },
      { id: "holidays", name: "Holidays in Canada", color: "#16a765", enabled: false },
    ]);

    // The admin panel sees the calendars, never the token.
    const status = await adminGET(req("/api/household/google/", { headers: { cookie: admin } }));
    const body = await status.text();
    expect(JSON.parse(body)).toMatchObject({ configured: true, connected: true });
    expect(body).not.toContain("refresh-1");
  });

  it("gives displays the enabled calendars' events, sorted, all-day first", async () => {
    await connectAs(await cookieFor("admin@example.com"));
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }));
    const data = (await r.json()) as CalendarData;
    expect(data.connected).toBe(true);
    expect(data.events.map((e) => e.title)).toEqual(["Pro-D Day", "Dinner at Lola's"]);
    expect(data.events[1]?.color).toBe("#4986e7");
    // Only the enabled calendar was asked, with the access token.
    const eventCalls = calls.filter((c) => c.url.includes("/events"));
    expect(eventCalls).toHaveLength(1);
    expect(new Headers(eventCalls[0]?.init?.headers).get("authorization")).toBe("Bearer access-1");
  });

  it("shows the owner's name, or the name typed in Settings, in place of the calendar's email", async () => {
    await connectAs(await cookieFor("admin@example.com"));
    expect(await getSecret(LEGACY_ACCOUNT_ID, "google.name")).toBe("Melvin Parinas");
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const chips = async () =>
      (
        (await (await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }))).json()) as CalendarData
      ).events.map((e) => e.calendar);

    const rename = async (name: string) => {
      const stored = await loadConfig(LEGACY_ACCOUNT_ID);
      const config = structuredClone(stored.config);
      const primary = config.integrations.google.calendars.find((c) => c.id === "me@example.com");
      if (primary) primary.name = name;
      await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);
    };
    await rename("me@example.com");
    expect(await chips()).toEqual(["Melvin Parinas", "Melvin Parinas"]);
    // A rename shows straight away rather than waiting for the cached events to expire.
    await rename("Dad");
    expect(await chips()).toEqual(["Dad", "Dad"]);
  });

  it("refuses a callback whose state doesn't match, and people who aren't admins", async () => {
    const admin = await cookieFor("admin@example.com");
    const forged = await callbackGET(
      req("/api/google/callback/?code=x&state=attacker", { headers: { cookie: `${admin}; ep_google_state=mine` } }),
    );
    expect(forged.headers.get("location")).toBe("/household/?google=expired#settings");
    expect(await getSecret(LEGACY_ACCOUNT_ID, "google.refreshToken")).toBeNull();

    const kid = await cookieFor("kid@example.com");
    expect((await connectGET(req("/api/google/connect/", { headers: { cookie: kid } }))).status).toBe(401);
  });

  it("tells displays when Google isn't connected, or stops accepting the token", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const before = (await (
      await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }))
    ).json()) as CalendarData;
    expect(before.connected).toBe(false);

    await connectAs(await cookieFor("admin@example.com"));
    resetGoogleForTests();
    clearMemoryCache();
    tokenAnswer = () => Response.json({ error: "invalid_grant" }, { status: 400 });
    const revoked = await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }));
    expect(((await revoked.json()) as CalendarData).connected).toBe(false);
  });

  it("disconnects: forgets the token and revokes it at Google", async () => {
    const admin = await cookieFor("admin@example.com");
    await connectAs(admin);
    const r = await adminDELETE(req("/api/household/google/", { method: "DELETE", headers: { cookie: admin } }));
    expect(r.status).toBe(200);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "google.refreshToken")).toBeNull();
    expect(await getSecret(LEGACY_ACCOUNT_ID, "google.name")).toBeNull();
    expect(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke"))).toBe(true);
  });
});
