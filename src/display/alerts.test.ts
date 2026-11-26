// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlertData, DisplayPayload, EmergencyAlert } from "@/lib/display/types";

let feed: ((d: AlertData) => void) | null = null;
vi.mock("./api", () => ({
  subscribe: (_name: string, _every: number, cb: (d: AlertData) => void) => {
    feed = cb;
    return () => undefined;
  },
}));

const { alertStrip, SERIOUS_SNOOZE_MS } = await import("./alerts");

const payload = { alerts: { enabled: true, banner: "moderate" } } as DisplayPayload;

function alert(over: Partial<EmergencyAlert>): EmergencyAlert {
  return {
    id: "naad:1",
    source: "weather",
    severity: "severe",
    title: "Evacuation order",
    area: "Langley",
    description: "Leave now by 208 Street.",
    sent: 1,
    expires: null,
    ...over,
  };
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === text)!;

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  feed = null;
});

describe("the alert strip", () => {
  it("opens on a tap instead of dismissing, and only the Dismiss button hides it", () => {
    const { el } = alertStrip(() => payload);
    feed!({ updatedAt: 1, alerts: [alert({}), alert({ id: "naad:2", severity: "moderate", title: "Rainfall warning" })] });
    expect(el.classList.contains("show")).toBe(true);
    expect(el.textContent).toContain("+1 more");

    el.click();
    expect(el.classList.contains("show")).toBe(true);
    expect(el.classList.contains("open")).toBe(true);
    expect(el.textContent).toContain("Leave now by 208 Street.");
    expect(el.textContent).toContain("Rainfall warning");

    button(el, "Close").click();
    expect(el.classList.contains("open")).toBe(false);
    expect(el.classList.contains("show")).toBe(true);

    el.click();
    button(el, "Dismiss").click();
    expect(el.classList.contains("show")).toBe(false);
  });

  it("brings a dismissed severe alert back after the snooze, but keeps a minor one hidden", () => {
    vi.useFakeTimers({ now: new Date("2026-11-26T20:00:00Z") });
    const minorPayload = { alerts: { enabled: true, banner: "minor" } } as DisplayPayload;
    const { el } = alertStrip(() => minorPayload);
    const data = { updatedAt: 1, alerts: [alert({}), alert({ id: "naad:2", severity: "minor", title: "Road work" })] };
    feed!(data);
    el.click();
    button(el, "Dismiss").click();
    expect(el.classList.contains("show")).toBe(false);

    vi.setSystemTime(Date.now() + SERIOUS_SNOOZE_MS + 1);
    feed!(data);
    expect(el.classList.contains("show")).toBe(true);
    expect(el.textContent).toContain("Evacuation order");
    expect(el.textContent).not.toContain("Road work");
  });

  it("puts an emergency ahead of a household notice on the strip", () => {
    const { el } = alertStrip(() => payload);
    feed!({
      updatedAt: 1,
      alerts: [alert({ id: "laundry:1", notice: true, severity: "minor", title: "Washer done" }), alert({})],
    });
    expect(el.querySelector(".as-text b")?.textContent).toBe("Evacuation order");
    expect(el.classList.contains("notice")).toBe(false);
  });
});
