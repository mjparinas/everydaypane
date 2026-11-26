import { describe, expect, it } from "vitest";

import {
  addDays,
  isSchoolDay,
  kindFromTitle,
  lunchOn,
  mergeDaysOff,
  nameFromTitle,
  nextSchoolDay,
  SCHOOL_PRESETS,
  schoolToday,
  upcomingDaysOff,
  type SchoolYear,
} from "./schoolCalendar";

const elementary = SCHOOL_PRESETS.find((p) => p.id === "sd35-elementary-2026-27")!;
const year: SchoolYear = elementary;

describe("school calendar", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("knows Langley's 2026–27 school days", () => {
    expect(isSchoolDay(year, "2026-11-23")).toBe(true); // a Monday
    expect(isSchoolDay(year, "2026-11-21")).toBe(false); // Saturday
    expect(isSchoolDay(year, "2026-11-20")).toBe(false); // Design & Assessment Day
    expect(isSchoolDay(year, "2026-12-03")).toBe(true); // early dismissal is still school
    expect(isSchoolDay(year, "2027-01-04")).toBe(false); // last day of winter break
    expect(isSchoolDay(year, "2027-01-05")).toBe(true);
    expect(isSchoolDay(year, "2026-09-04")).toBe(false); // before the first day
    expect(isSchoolDay(year, "2027-06-30")).toBe(false); // after the last day
  });

  it("says what today is", () => {
    expect(schoolToday(year, "2026-11-23")).toEqual({ state: "school" });
    expect(schoolToday(year, "2026-12-03")).toEqual({ state: "school", early: "Early dismissal (conferences)" });
    expect(schoolToday(year, "2026-11-11")).toEqual({ state: "off", name: "Remembrance Day", backOn: "2026-11-12" });
    expect(schoolToday(year, "2026-12-21")).toEqual({ state: "off", name: "Winter break", backOn: "2027-01-05" });
    // A weekend inside a break is still the break; one outside it is just the weekend.
    expect(schoolToday(year, "2026-12-19")).toMatchObject({ state: "off", name: "Winter break" });
    expect(schoolToday(year, "2026-11-28")).toEqual({ state: "weekend" });
    expect(schoolToday(year, "2026-08-20")).toEqual({ state: "summer", backOn: "2026-09-08" });
    expect(schoolToday(year, "2027-07-10")).toEqual({ state: "summer", backOn: null });
    expect(schoolToday(year, "2026-09-08")).toEqual({ state: "school", firstDay: true });
  });

  it("finds the next school day over a long weekend", () => {
    expect(nextSchoolDay(year, "2027-02-12")).toBe("2027-02-16"); // Family Day Monday
    expect(nextSchoolDay(year, "2027-06-29")).toBeNull();
  });

  it("lists the next days off, breaks as one entry, and summer last", () => {
    const next = upcomingDaysOff(year, "2026-11-23", 3);
    expect(next.map((o) => o.name)).toEqual(["Winter break", "Pro-D Day", "Family Day"]);
    expect(next[0]).toMatchObject({ start: "2026-12-18", end: "2027-01-04", weekdays: 12 });
    const late = upcomingDaysOff(year, "2027-05-25", 5);
    expect(late).toEqual([{ start: "2027-06-30", end: "2027-06-30", name: "Summer holidays", weekdays: 50 }]);
  });

  it("reads days off from calendar titles", () => {
    expect(kindFromTitle("Pro-D Day - No School")).toBe("off");
    expect(kindFromTitle("NON-INSTRUCTIONAL DAY")).toBe("off");
    expect(kindFromTitle("Spring Break")).toBe("off");
    expect(kindFromTitle("2 Hour Early Dismissal")).toBe("early");
    expect(kindFromTitle("Picture Day")).toBeNull();
    expect(kindFromTitle("Professional basketball game")).toBeNull();
    expect(nameFromTitle("Pro-D Day (Students Not in Attendance)")).toBe("Pro-D Day");
  });

  it("keeps the household's own entry when a link names the same day", () => {
    const own = [{ start: "2027-02-08", end: "2027-02-08", name: "Pro-D", kind: "off" as const }];
    const link = [
      { start: "2027-02-08", end: "2027-02-08", name: "District Pro-D Day", kind: "off" as const },
      { start: "2027-02-19", end: "2027-02-19", name: "Pro-D Day", kind: "off" as const },
      { start: "2027-02-19", end: "2027-02-19", name: "Pro-D Day", kind: "off" as const },
    ];
    expect(mergeDaysOff(own, link).map((d) => `${d.start} ${d.name}`)).toEqual(["2027-02-08 Pro-D", "2027-02-19 Pro-D Day"]);
  });

  it("gives the weekday's lunch on weekdays only", () => {
    const lunches = ["Pizza day", "", "Sushi", "", ""];
    expect(lunchOn(lunches, "2026-11-23")).toBe("Pizza day");
    expect(lunchOn(lunches, "2026-11-25")).toBe("Sushi");
    expect(lunchOn(lunches, "2026-11-29")).toBe("");
  });
});
