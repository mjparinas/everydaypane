import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import { configSchema } from "./config/schema";
import { inWindow, saverMode, SCREEN_SAVER_OFF } from "./screenSaver";

const MIN = 60_000;
const on = { ...SCREEN_SAVER_OFF, idle: true, night: true, minutes: 10 };
const at = (minute: number, now: number, lastActivity = -Infinity, loadedAt = 0) => ({ now, minute, lastActivity, loadedAt });

describe("night window", () => {
  it("runs past midnight", () => {
    expect(inWindow("23:00", "06:00", 23 * 60)).toBe(true);
    expect(inWindow("23:00", "06:00", 2 * 60)).toBe(true);
    expect(inWindow("23:00", "06:00", 6 * 60)).toBe(false);
    expect(inWindow("23:00", "06:00", 12 * 60)).toBe(false);
  });
  it("works within a day, and equal ends mean never", () => {
    expect(inWindow("13:00", "15:00", 14 * 60)).toBe(true);
    expect(inWindow("13:00", "15:00", 15 * 60)).toBe(false);
    expect(inWindow("06:00", "06:00", 6 * 60)).toBe(false);
  });
});

describe("screen saver", () => {
  it("is off until switched on", () => {
    expect(saverMode(SCREEN_SAVER_OFF, at(2 * 60, 999 * MIN))).toBe("off");
  });

  it("shows photos after the idle minutes, counting from the page load", () => {
    expect(saverMode(on, at(12 * 60, 9 * MIN))).toBe("off");
    expect(saverMode(on, at(12 * 60, 10 * MIN))).toBe("photos");
    expect(saverMode({ ...on, shows: "dark" }, at(12 * 60, 10 * MIN))).toBe("dark");
  });

  it("a touch restarts the idle minutes", () => {
    expect(saverMode(on, at(12 * 60, 30 * MIN, 25 * MIN))).toBe("off");
    expect(saverMode(on, at(12 * 60, 35 * MIN, 25 * MIN))).toBe("photos");
  });

  it("goes dark at night even right after a reload, and a touch wakes it for the minutes", () => {
    // The nightly reload at 3:30 must not light the screen up.
    expect(saverMode(on, at(3 * 60 + 30, 0, -Infinity, 0))).toBe("dark");
    expect(saverMode(on, at(3 * 60 + 30, 5 * MIN, 0))).toBe("off");
    expect(saverMode(on, at(3 * 60 + 40, 10 * MIN, 0))).toBe("dark");
  });

  it("dark at night wins over photos", () => {
    expect(saverMode(on, at(23 * 60 + 30, 60 * MIN))).toBe("dark");
  });

  it("night alone leaves the day alone", () => {
    const night = { ...SCREEN_SAVER_OFF, night: true };
    expect(saverMode(night, at(12 * 60, 999 * MIN))).toBe("off");
  });
});

describe("settings", () => {
  it("a document saved before the screen saver existed loads with it off", () => {
    const old: Partial<ReturnType<typeof defaultConfig>> = defaultConfig();
    delete old.screenSaver;
    const parsed = configSchema.parse(old);
    expect(parsed.screenSaver).toEqual(SCREEN_SAVER_OFF);
  });
  it("refuses a bad night time", () => {
    const c = defaultConfig();
    c.screenSaver.nightStart = "25:00";
    expect(configSchema.safeParse(c).success).toBe(false);
  });
});
