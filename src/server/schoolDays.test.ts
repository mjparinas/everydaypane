import { describe, expect, it } from "vitest";

import { daysOffFromEvents } from "./schoolDays";

const ev = (title: string, start: string, end: string, allDay = true) => ({
  id: title,
  title,
  start,
  end,
  allDay,
  color: "#000000",
  calendar: "School",
});

describe("school days feed", () => {
  it("turns a school calendar's events into days off", () => {
    expect(
      daysOffFromEvents([
        ev("Pro-D Day (Students Not in Attendance)", "2027-02-08", "2027-02-09"),
        ev("Spring Break", "2027-03-15", "2027-03-30"),
        ev("Early Dismissal", "2026-12-03T12:30:00-07:00", "2026-12-03T13:00:00-07:00", false),
        ev("No school reminder", "2026-12-04T08:00:00-07:00", "2026-12-04T09:00:00-07:00", false),
        ev("Picture Day", "2026-12-05", "2026-12-06"),
      ]),
    ).toEqual([
      { start: "2027-02-08", end: "2027-02-08", name: "Pro-D Day", kind: "off" },
      { start: "2027-03-15", end: "2027-03-29", name: "Spring Break", kind: "off" },
      { start: "2026-12-03", end: "2026-12-03", name: "Early Dismissal", kind: "early" },
    ]);
  });
});
