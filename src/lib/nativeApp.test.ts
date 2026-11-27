import { describe, expect, it } from "vitest";

import { iosSafari } from "@/components/InstallPrompt";

import { widgetSummary } from "./mobileWidget";
import { appRedirect, inNativeApp, nativePlatform, safeAppPath, sharedTextItems } from "./nativeApp";

const IOS_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 EverydaypaneApp/1 (iOS)";
const ANDROID_APP =
  "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36 EverydaypaneApp/1 (Android)";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15";

describe("the app's side of the site", () => {
  it("knows when it's inside the app, and which one", () => {
    expect(inNativeApp(IOS_APP)).toBe(true);
    expect(nativePlatform(IOS_APP)).toBe("ios");
    expect(nativePlatform(ANDROID_APP)).toBe("android");
    expect(inNativeApp(SAFARI)).toBe(false);
    expect(nativePlatform(SAFARI)).toBeNull();
  });

  it("sends marketing and pricing pages in the app to its start page", () => {
    expect(appRedirect("/", IOS_APP)).toBe(true);
    expect(appRedirect("/pricing/", ANDROID_APP)).toBe(true);
    expect(appRedirect("/blog/photo-frame-screen-saver/", IOS_APP)).toBe(true);
    expect(appRedirect("/privacy/", IOS_APP)).toBe(false);
    expect(appRedirect("/family/", IOS_APP)).toBe(false);
    expect(appRedirect("/pricing/", SAFARI)).toBe(false);
  });

  it("opens only our own paths from a notification", () => {
    expect(safeAppPath("/family/")).toBe("/family/");
    expect(safeAppPath("//evil.example/")).toBeNull();
    expect(safeAppPath("https://evil.example/")).toBeNull();
    expect(safeAppPath("javascript:alert(1)")).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });

  it("splits a shared list into shopping items", () => {
    expect(sharedTextItems("- Milk\n- Eggs\n\n2. Bread, butter")).toEqual(["Milk", "Eggs", "Bread", "butter"]);
    expect(sharedTextItems("☐ Apples\n✓ Pears")).toEqual(["Apples", "Pears"]);
    expect(sharedTextItems("x".repeat(81))).toEqual([]);
  });

  it("offers Add to Home Screen steps in iPhone and iPad Safari only", () => {
    expect(iosSafari(SAFARI, 5)).toBe(true);
    expect(iosSafari(IPAD, 5)).toBe(true);
    expect(iosSafari(IPAD, 0)).toBe(false);
    expect(iosSafari(IOS_APP, 5)).toBe(false);
    expect(iosSafari(SAFARI.replace("Version/26.1", "CriOS/142.0"), 5)).toBe(false);
  });
});

describe("home-screen widget summary", () => {
  const base = {
    today: "2026-11-27",
    todayMeals: { dinner: "Tacos" },
    tomorrowMeals: { dinner: "Soup" },
    shopping: {
      updatedAt: 1,
      items: [
        { id: "1", text: "Milk", done: false, category: "dairy" as const, low: true },
        { id: "2", text: "Eggs", done: true, category: "dairy" as const, low: false },
        { id: "3", text: "Bread", done: false, category: "bakery" as const, low: false },
      ],
    },
    chores: {
      today: "2026-11-27",
      pinSet: false,
      rewards: [],
      people: [
        { id: "sam", name: "Sam", emoji: "🦊", color: "#f00", goal: 0, stars: 0, available: 0 },
        { id: "ava", name: "Ava", emoji: "🐢", color: "#0f0", goal: 0, stars: 0, available: 0 },
        { id: "baby", name: "Baby", emoji: "👶", color: "#00f", goal: 0, stars: 0, available: 0 },
      ],
      chores: [],
      due: [
        { choreId: "bed", personId: "sam", done: true },
        { choreId: "dish", personId: "sam", done: false },
        { choreId: "bed", personId: "ava", done: true },
      ],
    },
    now: 5,
  };

  it("reads tonight's dinner, then tomorrow's from 8 PM", () => {
    expect(widgetSummary({ ...base, hour: 17 }).dinner).toEqual({ label: "Tonight", text: "Tacos" });
    expect(widgetSummary({ ...base, hour: 20 }).dinner).toEqual({ label: "Tomorrow", text: "Soup" });
    expect(widgetSummary({ ...base, hour: 9, todayMeals: {} }).dinner).toBeNull();
  });

  it("counts what's left to buy and to do, and who it's for", () => {
    const s = widgetSummary({ ...base, hour: 9 });
    expect(s.shopping).toEqual({ open: 2, low: 1, items: ["Milk", "Bread"] });
    expect(s.chores).toEqual({
      left: 1,
      total: 3,
      people: [
        { name: "Sam", emoji: "🦊", left: 1 },
        { name: "Ava", emoji: "🐢", left: 0 },
      ],
    });
    expect(widgetSummary({ ...base, hour: 9, shopping: null, chores: null }).chores).toEqual({ left: 0, total: 0, people: [] });
  });
});
