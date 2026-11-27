import { beforeEach, describe, expect, it, vi } from "vitest";

import { BRIEF_SOURCES } from "@/lib/briefSources";
import { defaultConfig } from "@/lib/config/defaults";

// Every source is mocked: this checks which feeds the brief asks for, not what they say (src/lib/brief.test.ts).
const calls: string[] = [];
const track =
  <T>(name: string, value: T) =>
  () => {
    calls.push(name);
    return Promise.resolve(value);
  };

vi.mock("./weather", () => ({ weather: track("weather", { value: { hours: [], days: [] } }) }));
vi.mock("./alerts", () => ({ alertsFeed: track("alerts", { updatedAt: 0, alerts: [] }) }));
vi.mock("./school", () => ({ schoolStatus: track("school", { state: "open" }) }));
vi.mock("./calendars", () => ({ combinedFeed: () => (calls.push("calendar"), Promise.reject(new Error("Google is down"))) }));
vi.mock("./garbage", () => ({ garbageFeed: track("garbage", { value: { configured: true, pickups: [] } }) }));
vi.mock("./ferries", () => ({ ferriesFeed: track("ferries", { down: false, routes: [] }) }));
vi.mock("./commute", () => ({ commuteFeed: track("commute", { missing: "", routes: [] }) }));
vi.mock("./meals", () => ({ mealsBetween: track("meals", {}) }));
vi.mock("./featureFlags", () => ({ flagsOff: () => Promise.resolve(new Set(["widget.meals"])) }));

const { briefFeed } = await import("./brief");

const all = { sources: [...BRIEF_SOURCES], eveningTomorrow: true };

describe("brief feed", () => {
  beforeEach(() => void (calls.length = 0));

  it("reads only sources the household has set up, and survives one failing", async () => {
    const config = defaultConfig();
    config.integrations.garbage.zoneId = "";
    config.integrations.commute.home = null;
    for (const v of config.views) v.widgets = v.widgets.filter((w) => w.type !== "school");
    const brief = await briefFeed("acct", config, all, Date.parse("2026-11-26T08:00:00-07:00"));
    // No school widget, no garbage zone, no commute home, meals switched off by a platform flag.
    expect(calls.sort()).toEqual(["alerts", "calendar", "ferries", "weather"]);
    expect(brief.greeting).toBe("Good morning");
  });

  it("asks for nothing the widget switched off", async () => {
    await briefFeed("acct", defaultConfig(), { ...all, sources: ["weather"] });
    expect(calls).toEqual(["weather"]);
  });
});
