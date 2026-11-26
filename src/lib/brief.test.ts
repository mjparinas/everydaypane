import { describe, expect, it } from "vitest";

import { composeBrief, hourLabel, precipKind, type BriefInput } from "./brief";
import type { CalendarEvent, WeatherData } from "./display/types";

// Thursday 2026-11-26 in Langley (UTC−7 all year since B.C.'s March 2026 change).
const TZ = "America/Vancouver";
const at = (local: string) => Date.parse(`${local}-07:00`);

function weatherFrom(hour: number, wet: Record<number, number> = {}, max = 9): WeatherData {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = hour + i;
    const date = h < 24 ? "2026-11-26" : "2026-11-27";
    const hh = String(h % 24).padStart(2, "0");
    const code = wet[h % 24] ?? 3;
    return { time: `${date}T${hh}:00`, temp: 7, code, precip: code >= 51 ? 80 : 10, isDay: h % 24 > 7 && h % 24 < 17 };
  });
  return {
    updatedAt: 0,
    units: { temp: "°C", wind: "km/h" },
    current: { temp: 7, feels: 5, code: 3, isDay: true, wind: 10, humidity: 80 },
    today: { sunrise: "", sunset: "" },
    hours,
    days: [
      { date: "2026-11-26", code: 61, max, min: 3, precip: 80 },
      { date: "2026-11-27", code: 2, max: 11, min: 4, precip: 10 },
    ],
  };
}

const event = (title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: title,
  title,
  start,
  end,
  allDay: false,
  color: "#5b8def",
  calendar: "Family",
  ...extra,
});

const base = (now: number, extra: Partial<BriefInput> = {}): BriefInput => ({
  now,
  timeZone: TZ,
  hour12: true,
  events: 3,
  eveningTomorrow: true,
  banner: "severe",
  ...extra,
});

describe("morning brief", () => {
  it("reads the coordinator's example day in one sentence", () => {
    const now = at("2026-11-26T07:30:00");
    const brief = composeBrief(
      base(now, {
        weather: weatherFrom(7, { 15: 61, 16: 61 }),
        calendar: {
          updatedAt: 0,
          from: "2026-11-01",
          to: "2027-01-10",
          events: [event("Sam's dentist", "2026-11-26T16:00:00-07:00", "2026-11-26T17:00:00-07:00")],
        },
        garbage: { updatedAt: 0, configured: true, pickups: [{ date: "2026-11-27", bins: [{ name: "Garbage", kind: "garbage" }] }] },
        ferries: {
          updatedAt: 0,
          at: now,
          down: false,
          routes: [
            {
              code: "TSASWB",
              name: "Tsawwassen – Swartz Bay",
              duration: "1h 35m",
              status: "",
              sailings: [{ time: "09:00", arrive: "10:35", state: "delayed", delayMinutes: 25, vessel: "", note: "" }],
            },
          ],
        },
      }),
    );
    expect(brief.greeting).toBe("Good morning");
    expect(brief.day).toBe("today");
    expect(brief.summary).toBe("Rain at 3 PM, Sam's dentist at 4 PM, garbage out tonight, ferry delays up to 25 min.");
    expect(brief.items.map((i) => i.source)).toEqual(["weather", "calendar", "garbage", "ferries"]);
    expect(brief.items[0]?.detail).toBe("High of 9°");
  });

  it("says how long rain lasts when it's already raining, and 24-hour times when asked", () => {
    const rainy = weatherFrom(9, { 9: 61, 10: 63, 11: 61 });
    expect(composeBrief(base(at("2026-11-26T09:10:00"), { weather: rainy, hour12: false })).summary).toBe("Rain until 12:00.");
    const snowy = weatherFrom(9, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [9 + i, 73])));
    expect(composeBrief(base(at("2026-11-26T09:10:00"), { weather: snowy })).items[0]?.text).toBe("Snow all day");
  });

  it("names only events still ahead, all-day ones first, and counts the rest", () => {
    const now = at("2026-11-26T12:00:00");
    const events = [
      event("Breakfast club", "2026-11-26T07:00:00-07:00", "2026-11-26T08:00:00-07:00"),
      event("Pro-D Day", "2026-11-26", "2026-11-27", { allDay: true }),
      event("Swim", "2026-11-26T17:30:00-07:00", "2026-11-26T18:30:00-07:00"),
      event("Piano", "2026-11-26T15:00:00-07:00", "2026-11-26T16:00:00-07:00"),
      event("Book club", "2026-11-26T19:00:00-07:00", "2026-11-26T21:00:00-07:00"),
      event("Tomorrow's thing", "2026-11-27T10:00:00-07:00", "2026-11-27T11:00:00-07:00"),
    ];
    const brief = composeBrief(base(now, { calendar: { updatedAt: 0, from: "", to: "", events } }));
    expect(brief.greeting).toBe("Good afternoon");
    expect(brief.items.map((i) => i.text)).toEqual(["Pro-D Day", "Piano at 3 PM", "Swim at 5:30 PM", "1 more on the calendar"]);
  });

  it("reads tomorrow from 7 PM: its weather, plans, bins and dinner", () => {
    const now = at("2026-11-26T20:15:00");
    const brief = composeBrief(
      base(now, {
        weather: weatherFrom(20),
        calendar: {
          updatedAt: 0,
          from: "",
          to: "",
          events: [event("Soccer", "2026-11-27T09:00:00-07:00", "2026-11-27T10:00:00-07:00")],
        },
        countdowns: [{ id: "maya", name: "Maya's birthday", date: "2018-11-27", emoji: "", kind: "birthday", yearly: true }],
        garbage: {
          updatedAt: 0,
          configured: true,
          pickups: [
            {
              date: "2026-11-27",
              bins: [
                { name: "Recycling", kind: "recycling" },
                { name: "Green Cart", kind: "organics" },
              ],
            },
          ],
        },
        meals: { today: "2026-11-26", meals: { "2026-11-27": { dinner: "Tacos" } } },
        ferries: {
          updatedAt: 0,
          at: now,
          down: false,
          routes: [
            {
              code: "TSASWB",
              name: "T",
              duration: "",
              status: "",
              sailings: [{ time: "21:00", arrive: "", state: "cancelled", vessel: "", note: "" }],
            },
          ],
        },
      }),
    );
    expect(brief.day).toBe("tomorrow");
    expect(brief.date).toBe("2026-11-27");
    expect(brief.greeting).toBe("Good evening");
    // Tonight's ferry doesn't belong in tomorrow's brief.
    expect(brief.summary).toBe(
      "Dry, high of 11°, Maya's birthday (turning 8), Soccer at 9 AM, recycling and green cart out tonight, Tacos for dinner.",
    );
  });

  it("keeps reading today in the evening when that's switched off", () => {
    const brief = composeBrief(base(at("2026-11-26T20:15:00"), { eveningTomorrow: false, weather: weatherFrom(20) }));
    expect(brief.day).toBe("today");
    expect(brief.summary).toBe("Dry, high of 9°.");
  });

  it("mentions garbage day only before noon, and bins for tomorrow after", () => {
    const g = {
      updatedAt: 0,
      configured: true,
      pickups: [
        { date: "2026-11-26", bins: [{ name: "Garbage", kind: "garbage" as const }] },
        { date: "2026-11-27", bins: [{ name: "Recycling", kind: "recycling" as const }] },
      ],
    };
    expect(composeBrief(base(at("2026-11-26T07:00:00"), { garbage: g })).summary).toBe("Garbage pickup today.");
    expect(composeBrief(base(at("2026-11-26T13:00:00"), { garbage: g })).summary).toBe("Recycling out tonight.");
    expect(composeBrief(base(at("2026-11-26T07:00:00"), { garbage: { ...g, configured: false } })).items).toEqual([]);
  });

  it("puts strip-worthy alerts and school closures first, and skips household notices", () => {
    const now = at("2026-11-26T07:00:00");
    const brief = composeBrief(
      base(now, {
        alerts: {
          updatedAt: 0,
          alerts: [
            {
              id: "a",
              source: "weather",
              severity: "moderate",
              title: "Special weather statement",
              area: "",
              description: "",
              sent: 0,
              expires: null,
            },
            { id: "b", source: "weather", severity: "severe", title: "Wind warning", area: "", description: "", sent: 0, expires: null },
            {
              id: "c",
              source: "laundry",
              severity: "minor",
              title: "Dryer done",
              area: "",
              description: "",
              sent: 0,
              expires: null,
              notice: true,
            },
          ],
        },
        school: { updatedAt: 0, state: "closed", summary: "All schools closed", detail: "", districtName: "Langley" },
        meals: { today: "2026-11-26", meals: { "2026-11-26": { dinner: "Soup" } } },
      }),
    );
    expect(brief.summary).toBe("Wind warning, all schools closed, Soup for dinner.");
    expect(brief.items.map((i) => i.tone)).toEqual(["alert", "warn", ""]);
  });

  it("mentions heavy traffic only when it's a real delay and a fresh reading", () => {
    const now = at("2026-11-26T07:30:00");
    const route = (name: string, seconds: number, free: number, at = now) => ({
      id: name,
      name,
      emoji: "",
      arriveBy: "",
      seconds,
      freeFlowSeconds: free,
      delaySeconds: seconds - free,
      at,
    });
    const brief = composeBrief(
      base(now, {
        commute: {
          updatedAt: 0,
          missing: "",
          routes: [route("Work", 2700, 1500), route("School", 900, 600), route("Gym", 3000, 1200, now - 30 * 60_000)],
        },
      }),
    );
    expect(brief.items.map((i) => i.text)).toEqual(["Heavy traffic to Work"]);
    expect(brief.items[0]?.detail).toBe("45 min, 20 more than usual");
  });

  it("says a quiet day plainly when there's nothing to say", () => {
    expect(composeBrief(base(at("2026-11-26T09:00:00"))).summary).toBe("A quiet day, with nothing planned.");
    expect(composeBrief(base(at("2026-11-26T21:00:00"))).summary).toBe("Nothing planned for tomorrow.");
  });

  it("formats hours and reads WMO codes", () => {
    expect(hourLabel(0, true)).toBe("12 AM");
    expect(hourLabel(15, true)).toBe("3 PM");
    expect(hourLabel(7, false)).toBe("07:00");
    expect([61, 81, 73, 86, 95, 3].map(precipKind)).toEqual(["rain", "rain", "snow", "snow", "thunder", ""]);
  });
});
