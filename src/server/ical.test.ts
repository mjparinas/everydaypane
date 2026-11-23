import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as adminGET, DELETE, POST } from "@/app/api/household/calendar-links/route";
import { GET as displayGET } from "@/app/api/display/calendar/route";
import type { CalendarData } from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { checkIcal, getIcalUrl, normaliseIcalUrl, parseIcal } from "./ical";

// Reserved names such as school.example.com don't resolve here; the fetch itself is stubbed.
vi.mock("node:dns/promises", () => ({
  lookup: () => Promise.resolve([{ address: "1.1.1.1", family: 4 }]),
}));

const link = { id: "school1", name: "School", color: "#16a34a" };
const zone = "America/Vancouver";

// A calendar as Google and school systems publish it: a VTIMEZONE, a weekly practice with one week cancelled and one
// moved, an all-day event, a UTC event and a cancelled one. Times use the -08:00 standard offset in the VTIMEZONE.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Riverside Elementary
BEGIN:VTIMEZONE
TZID:America/Vancouver
BEGIN:STANDARD
DTSTART:19701101T020000
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:soccer@test
SUMMARY:Soccer practice
LOCATION:Field 2
DTSTART;TZID=America/Vancouver:20261102T170000
DTEND;TZID=America/Vancouver:20261102T180000
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=6
EXDATE;TZID=America/Vancouver:20261109T170000
END:VEVENT
BEGIN:VEVENT
UID:soccer@test
RECURRENCE-ID;TZID=America/Vancouver:20261116T170000
SUMMARY:Soccer practice (moved)
DTSTART;TZID=America/Vancouver:20261116T180000
DTEND;TZID=America/Vancouver:20261116T190000
END:VEVENT
BEGIN:VEVENT
UID:proday@test
SUMMARY:Pro-D day
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261121
END:VEVENT
BEGIN:VEVENT
UID:assembly@test
SUMMARY:Assembly
DTSTART:20261118T170000Z
DTEND:20261118T180000Z
END:VEVENT
BEGIN:VEVENT
UID:gone@test
SUMMARY:Cancelled trip
STATUS:CANCELLED
DTSTART:20261119T170000Z
DTEND:20261119T180000Z
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");

describe("calendar links: reading iCal", () => {
  const events = () => parseIcal(ICS, link, "2026-10-25", "2026-12-07", zone);

  it("expands weekly events, skipping excluded weeks and using moved ones", () => {
    const practice = events().filter((e) => e.title.startsWith("Soccer"));
    expect(practice.map((e) => [e.title, e.start])).toEqual([
      ["Soccer practice", "2026-11-03T01:00:00.000Z"],
      ["Soccer practice (moved)", "2026-11-17T02:00:00.000Z"],
      ["Soccer practice", "2026-11-24T01:00:00.000Z"],
      ["Soccer practice", "2026-12-01T01:00:00.000Z"],
      // The sixth, on Dec 7 at 5 PM, is past the feed's last day.
    ]);
    expect(practice[0]).toMatchObject({ calendar: "School", color: "#16a34a", location: "Field 2", allDay: false });
  });

  it("keeps all-day dates as dates, reads UTC times, and drops cancelled events", () => {
    const all = events();
    expect(all.find((e) => e.title === "Pro-D day")).toMatchObject({ start: "2026-11-20", end: "2026-11-21", allDay: true });
    expect(all.find((e) => e.title === "Assembly")?.start).toBe("2026-11-18T17:00:00.000Z");
    expect(all.some((e) => e.title === "Cancelled trip")).toBe(false);
  });

  it("reads floating times (no zone) in the dashboard's zone", () => {
    const floating = ICS.replace("DTSTART:20261118T170000Z", "DTSTART:20261118T090000").replace(
      "DTEND:20261118T180000Z",
      "DTEND:20261118T100000",
    );
    const assembly = parseIcal(floating, link, "2026-10-25", "2026-12-07", zone).find((e) => e.title === "Assembly");
    const wall = zonedFormatter(zone, { dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
    expect(wall.format(Date.parse(assembly?.start ?? ""))).toBe("2026-11-18, 09:00");
  });

  it("leaves out events outside the feed's days", () => {
    expect(parseIcal(ICS, link, "2027-03-01", "2027-04-01", zone)).toEqual([]);
  });

  it("accepts https and webcal addresses only, and never private ones", () => {
    expect(normaliseIcalUrl("webcal://calendar.google.com/calendar/ical/x/basic.ics")).toEqual({
      url: "https://calendar.google.com/calendar/ical/x/basic.ics",
    });
    expect("error" in normaliseIcalUrl("http://example.com/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("https://localhost/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("https://printer.local/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("https://192.168.1.10/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("https://[::1]/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("https://calendar.local/a.ics")).toBe(true);
    expect("error" in normaliseIcalUrl("not a url")).toBe(true);
  });
});

describe("ical download redirects", () => {
  useTestServer();

  it("refuses a public address that redirects onto a private host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const r = new Response("BEGIN:VCALENDAR\nEND:VCALENDAR", { headers: { "content-type": "text/calendar" } });
        Object.defineProperty(r, "url", { value: "https://127.0.0.1/secret.ics" });
        return r;
      }),
    );
    await expect(checkIcal("https://attacker.example/cal.ics", "2026-11-01", "2026-12-01", "America/Vancouver")).rejects.toThrow(
      /public https/i,
    );
  });
});

describe("calendar links: admin and displays", () => {
  useTestServer();
  let answer: () => Response;
  beforeEach(() => {
    answer = () => new Response(ICS, { headers: { "content-type": "text/calendar" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer()),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-17T20:00:00Z"));
    clearMemoryCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function addLink(admin: string) {
    const r = await POST(
      req("/api/household/calendar-links/", {
        method: "POST",
        headers: { cookie: admin },
        body: JSON.stringify({ id: "school1", url: "webcal://school.example.com/cal.ics" }),
      }),
    );
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.integrations.icals = [{ id: "school1", name: "School", color: "#16a34a", enabled: true }];
    await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);
    return r;
  }

  it("checks a pasted address, stores it encrypted, and never shows it back", async () => {
    const admin = await cookieFor("admin@example.com");
    const r = await addLink(admin);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, name: "Riverside Elementary" });
    expect(await getIcalUrl(LEGACY_ACCOUNT_ID, "school1")).toBe("https://school.example.com/cal.ics");
    const listed = await adminGET(req("/api/household/calendar-links/", { headers: { cookie: admin } }));
    const text = await listed.text();
    expect(JSON.parse(text)).toEqual({ links: { school1: true } });
    expect(text).not.toContain("school.example.com");
    expect(JSON.stringify((await loadConfig(LEGACY_ACCOUNT_ID)).config)).not.toContain("school.example.com");
  });

  it("refuses an address that isn't a calendar, and people who aren't admins", async () => {
    const admin = await cookieFor("admin@example.com");
    answer = () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } });
    const bad = await POST(
      req("/api/household/calendar-links/", {
        method: "POST",
        headers: { cookie: admin },
        body: JSON.stringify({ id: "school1", url: "https://school.example.com/x" }),
      }),
    );
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("isn't an iCal calendar");
    expect(await getIcalUrl(LEGACY_ACCOUNT_ID, "school1")).toBeNull();

    const kid = await cookieFor("kid@example.com");
    const refused = await POST(
      req("/api/household/calendar-links/", {
        method: "POST",
        headers: { cookie: kid },
        body: JSON.stringify({ id: "school1", url: "https://school.example.com/x" }),
      }),
    );
    expect(refused.status).toBe(401);
  });

  it("gives displays the link's events without Google, and forgets the address when removed", async () => {
    const admin = await cookieFor("admin@example.com");
    await addLink(admin);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }));
    const data = (await r.json()) as CalendarData;
    expect(data.connected).toBe(true);
    expect(data.events.map((e) => e.title)).toContain("Pro-D day");
    expect(data.events.every((e) => e.calendar === "School")).toBe(true);

    await DELETE(req("/api/household/calendar-links/?id=school1", { method: "DELETE", headers: { cookie: admin } }));
    expect(await getIcalUrl(LEGACY_ACCOUNT_ID, "school1")).toBeNull();
  });

  it("still answers when the link's server fails, from the last good copy", async () => {
    const admin = await cookieFor("admin@example.com");
    await addLink(admin);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }));
    answer = () => new Response("down", { status: 503 });
    vi.setSystemTime(Date.parse("2026-11-17T21:00:00Z"));
    const r = await displayGET(req("/api/display/calendar/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as CalendarData).events.length).toBeGreaterThan(0);
  });
});
