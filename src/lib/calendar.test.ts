import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/display/types";

import { addDays, byDay, dayLabel, eventDays, eventTime, monthGrid } from "./calendar";

const TZ = "America/Vancouver";
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  title: "Soccer",
  start: "2026-11-17T17:00:00-07:00",
  end: "2026-11-17T18:30:00-07:00",
  allDay: false,
  color: "#3b5bdb",
  calendar: "Family",
  ...over,
});

describe("calendar dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("places a timed event on its local day, even when it is already the next day in UTC", () => {
    // 5 PM in Vancouver is midnight the next day in UTC (B.C. stays on UTC−7 year-round from 2026).
    expect(eventDays(ev({}), TZ)).toEqual(["2026-11-17"]);
  });

  it("spreads an all-day event over its days, with Google's exclusive end date", () => {
    expect(eventDays(ev({ allDay: true, start: "2026-11-20", end: "2026-11-23" }), TZ)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(eventDays(ev({ allDay: true, start: "2026-11-20", end: "2026-11-21" }), TZ)).toEqual(["2026-11-20"]);
  });

  it("puts an event that ends at midnight on one day, and one that crosses midnight on both", () => {
    expect(eventDays(ev({ start: "2026-11-17T22:00:00-07:00", end: "2026-11-18T00:00:00-07:00" }), TZ)).toEqual(["2026-11-17"]);
    expect(eventDays(ev({ start: "2026-11-17T22:00:00-07:00", end: "2026-11-18T01:00:00-07:00" }), TZ)).toEqual([
      "2026-11-17",
      "2026-11-18",
    ]);
  });

  it("groups events by day with all-day ones first", () => {
    const days = byDay([ev({ id: "timed" }), ev({ id: "allday", allDay: true, start: "2026-11-17", end: "2026-11-18" })], TZ);
    expect(days.get("2026-11-17")?.map((e) => e.id)).toEqual(["allday", "timed"]);
  });

  it("builds a month grid of whole weeks, starting on Sunday or Monday", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const sunday = monthGrid("2026-11-17", 0);
    expect(sunday[0]?.[0]).toBe("2026-11-01");
    expect(sunday.at(-1)?.at(-1)).toBe("2026-12-05");
    expect(sunday).toHaveLength(5);
    const monday = monthGrid("2026-11-17", 1);
    expect(monday[0]?.[0]).toBe("2026-10-26");
    expect(monday.at(-1)?.at(-1)).toBe("2026-12-06");
    expect(monday).toHaveLength(6);
  });

  it("names days the way the schedule reads", () => {
    expect(dayLabel("2026-11-17", "2026-11-17")).toBe("Today");
    expect(dayLabel("2026-11-18", "2026-11-17")).toBe("Tomorrow");
    expect(dayLabel("2026-11-19", "2026-11-17")).toBe("Thu, Nov 19");
  });

  it("says when an event happens on a given day", () => {
    expect(eventTime(ev({}), "2026-11-17", TZ, true)).toBe("5 PM");
    expect(eventTime(ev({ start: "2026-11-17T09:30:00-07:00" }), "2026-11-17", TZ, true)).toBe("9:30 AM");
    expect(eventTime(ev({ start: "2026-11-17T09:30:00-07:00" }), "2026-11-17", TZ, false)).toBe("09:30");
    const overnight = ev({ start: "2026-11-17T22:00:00-07:00", end: "2026-11-18T07:00:00-07:00" });
    expect(eventTime(overnight, "2026-11-18", TZ, true)).toBe("Until 7 AM");
    expect(eventTime(ev({ allDay: true, start: "2026-11-17", end: "2026-11-18" }), "2026-11-17", TZ, true)).toBe("All day");
  });
});
