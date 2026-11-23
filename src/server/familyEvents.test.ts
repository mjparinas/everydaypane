import { describe, expect, it } from "vitest";

import { DELETE, PATCH } from "@/app/api/family-events/[id]/route";
import { GET, POST } from "@/app/api/family-events/route";
import { defaultConfig } from "@/lib/config/defaults";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { combinedFeed } from "./calendars";
import { createFamilyEvent, eventsInRange, FAMILY_CALENDAR, toCalendar, validSpan } from "./familyEvents";

const event = {
  title: "Dentist",
  allDay: true,
  start: "2026-12-01",
  end: "2026-12-02",
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("family events", () => {
  useTestServer();

  it("checks span rules", () => {
    expect(validSpan(true, "2026-12-01", "2026-12-02")).toBe(true);
    expect(validSpan(true, "2026-12-02", "2026-12-01")).toBe(false);
    expect(validSpan(false, "2026-12-01T10:00:00-08:00", "2026-12-01T11:00:00-08:00")).toBe(true);
  });

  it("lets family post and read events without emails", async () => {
    const kid = await cookieFor("kid@example.com");
    const posted = await POST(req("/api/family-events/", { method: "POST", body: JSON.stringify(event), headers: { cookie: kid } }));
    expect(posted.status).toBe(201);
    const listed = await GET(req("/api/family-events/", { headers: { cookie: kid } }));
    const body = (await listed.json()) as { events: { title: string; mine: boolean }[] };
    expect(body.events.map((e) => [e.title, e.mine])).toEqual([["Dentist", true]]);
    expect(JSON.stringify(body)).not.toContain("@example.com");
  });

  it("merges into the calendar feed as Family", async () => {
    await createFamilyEvent(LEGACY_ACCOUNT_ID, { ...event, createdBy: "kid@example.com" });
    const feed = await combinedFeed(LEGACY_ACCOUNT_ID, defaultConfig());
    const got = feed.data.events.find((e) => e.title === "Dentist");
    expect(got).toMatchObject({ calendar: FAMILY_CALENDAR, color: "#5b8def", allDay: true });
    expect(feed.connected).toBe(true);
  });

  it("limits delete to the author or an admin", async () => {
    const kid = await cookieFor("kid@example.com");
    const admin = await cookieFor("admin@example.com");
    const created = await createFamilyEvent(LEGACY_ACCOUNT_ID, { ...event, title: "Soccer", createdBy: "admin@example.com" });
    expect(created).not.toBe("invalid");
    if (created === "invalid") return;
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: kid } }), ctx(created.id))).status).toBe(403);
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: admin } }), ctx(created.id))).status).toBe(200);
  });

  it("can update an event", async () => {
    const kid = await cookieFor("kid@example.com");
    const created = await createFamilyEvent(LEGACY_ACCOUNT_ID, { ...event, createdBy: "kid@example.com" });
    if (created === "invalid") throw new Error("bad event");
    const r = await PATCH(
      req("/", {
        method: "PATCH",
        body: JSON.stringify({ ...event, title: "Dentist check-up" }),
        headers: { cookie: kid },
      }),
      ctx(created.id),
    );
    expect(r.status).toBe(200);
    const rows = await eventsInRange(LEGACY_ACCOUNT_ID, "2026-11-01", "2027-01-01");
    expect(rows[0]?.title).toBe("Dentist check-up");
    expect(toCalendar(created).id).toMatch(/^family:/);
  });
});
