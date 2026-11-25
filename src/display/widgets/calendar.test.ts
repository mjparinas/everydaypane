// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { CalendarData, DisplayPayload } from "@/lib/display/types";

import { agenda, calendarMonth } from "./calendar";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };

const data: CalendarData = {
  updatedAt: 1,
  from: "2026-11-22",
  to: "2026-12-01",
  events: [
    {
      id: "1",
      title: "Put Out Garbage/Recycling",
      start: "2026-11-22T20:00:00-07:00",
      end: "2026-11-22T20:30:00-07:00",
      allDay: false,
      color: "#c4a574",
      calendar: "Family",
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("agenda widget", () => {
  it("keeps a Today title without a second Today day label on today's schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00-07:00"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(data))),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("agenda", "a", { x: 0, y: 0 }), title: "Today", range: "today" as const, days: 3 };
    const stop = agenda(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".w-label")?.textContent).toBe("Today");
    expect(el.querySelector(".ag-head")).toBeNull();
    expect(el.querySelector(".ag-title")?.textContent).toBe("Put Out Garbage/Recycling");
    stop();
  });

  it("still labels each day when the schedule shows upcoming days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00-07:00"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            ...data,
            events: [
              ...data.events,
              {
                id: "2",
                title: "School concert",
                start: "2026-11-23T18:00:00-07:00",
                end: "2026-11-23T19:00:00-07:00",
                allDay: false,
                color: "#5b8def",
                calendar: "Family",
              },
            ],
          } satisfies CalendarData),
        ),
      ),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("agenda", "a", { x: 0, y: 0 }), title: "Schedule", range: "upcoming" as const, days: 3 };
    const stop = agenda(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".w-label")?.textContent).toBe("Schedule");
    expect([...el.querySelectorAll(".ag-head")].map((n) => n.textContent)).toEqual(["Today", "Tomorrow"]);
    stop();
  });
});

describe("month calendar day details", () => {
  it("shows every event with its calendar colour and source, then closes from the button", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00-07:00"));
    const events = Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      title: `Event ${index + 1}`,
      start: "2026-11-22T20:00:00-07:00",
      end: "2026-11-22T20:30:00-07:00",
      allDay: false,
      color: index === 0 ? "#c4a574" : "#5b8def",
      calendar: index < 4 ? "Family" : "School",
      location: index === 0 ? "Home" : undefined,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ ...data, events } satisfies CalendarData))),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("calendarMonth", "m", { x: 0, y: 0 }), showDayDetails: true };
    const stop = calendarMonth(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);

    expect(el.querySelector(".mo-days.mo-scroll")).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.mo-day[data-date="2026-11-22"]')?.click();
    expect(document.querySelectorAll(".mo-detail-event")).toHaveLength(8);
    expect(document.querySelector(".mo-detail-event")?.getAttribute("style")).toContain("#c4a574");
    expect(document.querySelector(".mo-detail-source")?.textContent).toBe("Family");
    expect(document.querySelector(".mo-detail-location")?.textContent).toBe("Home");
    expect(el.querySelector(".mo-days.mo-scroll")).not.toBeNull();

    document.querySelector<HTMLButtonElement>(".mo-modal-close")?.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    stop();
  });

  it("opens on an empty day, dismisses on outside click, and respects the toggle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00-07:00"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(data))),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("calendarMonth", "m", { x: 0, y: 0 }), showDayDetails: true };
    const stop = calendarMonth(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);

    el.querySelector<HTMLButtonElement>('.mo-day[data-date="2026-11-23"]')?.click();
    expect(document.querySelector(".mo-detail-empty")?.textContent).toBe("Nothing planned for this day.");
    document.querySelector(".mo-modal-backdrop")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    stop();

    document.body.replaceChildren();
    const disabledEl = document.createElement("div");
    const disabledWidget = { ...newWidget("calendarMonth", "m2", { x: 0, y: 0 }), showDayDetails: false };
    const stopDisabled = calendarMonth(disabledEl, disabledWidget, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(disabledEl.querySelector(".mo-day-action")).toBeNull();
    stopDisabled();
  });
});
