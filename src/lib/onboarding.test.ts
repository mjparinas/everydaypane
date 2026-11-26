import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isFeatureFlag } from "./featureFlags";
import { dueStep, liveSteps, ONBOARDING } from "./onboarding";

const TZ = "America/Vancouver";
// 2026-12-01 10:00 in Vancouver (UTC−7 all year since March 2026).
const SIGNUP = Date.UTC(2026, 11, 1, 17);
const H = 3_600_000;
const all = liveSteps(() => true);

describe("getting-started series", () => {
  it("has one picture per email, small enough for a phone", () => {
    for (const s of ONBOARDING) {
      const file = path.join(process.cwd(), "public/email/onboarding", `${s.image.file}.jpg`);
      expect(fs.existsSync(file), s.image.file).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(120_000);
    }
  });

  it("never repeats a feature, a subject or a picture", () => {
    for (const key of ["id", "subject", "title"] as const) expect(new Set(ONBOARDING.map((s) => s[key])).size).toBe(ONBOARDING.length);
    expect(new Set(ONBOARDING.map((s) => s.image.file)).size).toBe(ONBOARDING.length);
  });

  it("mixes Free and Household, starting Free", () => {
    expect(ONBOARDING[0]!.tier).toBe("free");
    const free = ONBOARDING.filter((s) => s.tier === "free").length;
    expect(free).toBeGreaterThanOrEqual(6);
    expect(ONBOARDING.length - free).toBeGreaterThanOrEqual(free);
  });

  it("names only real feature flags and only household paths", () => {
    for (const s of ONBOARDING) {
      for (const f of [...s.flags, ...s.points.flatMap((p) => (p.flag ? [p.flag] : []))]) expect(isFeatureFlag(f), f).toBe(true);
      expect(s.cta.path.startsWith("/household/#")).toBe(true);
      expect(s.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("is written in Canadian English and calls the paid plan Household", () => {
    const words = JSON.stringify(ONBOARDING);
    expect(words).not.toMatch(/\bcolor|favorite|center\b|\bPro\b|EverydayPane|Everyday Pane/);
  });

  it("skips an email whose feature is switched off and drops switched-off points", () => {
    const steps = liveSteps((f) => f !== "widget.chores" && f !== "widget.shopping");
    expect(steps.some((s) => s.id === "chores")).toBe(false);
    expect(steps.find((s) => s.id === "meals")!.points.some((p) => p.flag === "widget.shopping")).toBe(false);
  });

  it("sends the first an hour after sign-up, then one a day from 10 AM", () => {
    expect(dueStep(all, [], SIGNUP, TZ, SIGNUP + 30 * 60_000)).toBeNull();
    const first = dueStep(all, [], SIGNUP, TZ, SIGNUP + H)!;
    expect(first.step.id).toBe("wall");
    expect(first).toMatchObject({ n: 1, total: ONBOARDING.length });
    const sent = [{ step: "wall", sentAt: SIGNUP + H }];
    expect(dueStep(all, sent, SIGNUP, TZ, SIGNUP + 5 * H)).toBeNull(); // same day
    expect(dueStep(all, sent, SIGNUP, TZ, SIGNUP + 23 * H)).toBeNull(); // 9 AM next day
    expect(dueStep(all, sent, SIGNUP, TZ, SIGNUP + 24 * H)!.step.id).toBe("calendars");
  });

  it("waits for the morning after a late-night sign-up and never sends after 9 PM", () => {
    const late = Date.UTC(2026, 11, 2, 6); // 11 PM in Vancouver
    expect(dueStep(all, [], late, TZ, late + 2 * H)).toBeNull(); // 1 AM
    expect(dueStep(all, [], late, TZ, late + 10 * H)).toBeNull(); // 9 AM
    expect(dueStep(all, [], late, TZ, late + 11 * H)!.step.id).toBe("wall"); // 10 AM
    expect(dueStep(all, [{ step: "wall", sentAt: SIGNUP }], SIGNUP, TZ, Date.UTC(2026, 11, 3, 4, 30))).toBeNull(); // 9:30 PM
  });

  it("stops after the last one", () => {
    const sent = ONBOARDING.map((s, i) => ({ step: s.id, sentAt: SIGNUP + i * 24 * H }));
    expect(dueStep(all, sent, SIGNUP, TZ, SIGNUP + 40 * 24 * H)).toBeNull();
  });
});
