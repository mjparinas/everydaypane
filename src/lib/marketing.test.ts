import { describe, expect, it } from "vitest";

import { postBySlug, POSTS } from "../content/posts";
import { shortCommit } from "./build";
import { COMPETITORS } from "./compare";
import { MARKETING_PLAN_TABLE, MARKETING_PLANS } from "./marketingPlans";
import { FREE_LIMITS, PAID_LIMITS } from "./plans";

describe("marketing content", () => {
  it("has unique blog slugs and a latest release", () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(postBySlug("whats-new-0-5-0")).toBeTruthy();
    expect(postBySlug("kitchen-wall-dashboard-free")).toBeTruthy();
  });
  it("lists competitors and two plans with Household highlighted", () => {
    expect(COMPETITORS.length).toBeGreaterThanOrEqual(5);
    const paid = MARKETING_PLANS.find((p) => p.id === "paid");
    const free = MARKETING_PLANS.find((p) => p.id === "free");
    expect(paid?.highlighted).toBe(true);
    expect(paid?.name).toBe("Household");
    expect(free?.features.some((f) => /2 wall displays/i.test(f))).toBe(true);
  });
  it("keeps Free/Household limits aligned with plans.ts", () => {
    const free = MARKETING_PLANS.find((p) => p.id === "free");
    const paid = MARKETING_PLANS.find((p) => p.id === "paid");
    expect(free?.features.some((f) => f.includes(`${FREE_LIMITS.displays} wall displays`))).toBe(true);
    expect(free?.features.some((f) => f.includes(`${FREE_LIMITS.views} view`))).toBe(true);
    expect(paid?.features.some((f) => f.includes(`${PAID_LIMITS.displays} displays`))).toBe(true);
    expect(paid?.features.some((f) => f.includes(`${PAID_LIMITS.views} views`))).toBe(true);
    expect(paid?.features.some((f) => f.includes(`${PAID_LIMITS.calendars} calendars`))).toBe(true);
    expect(MARKETING_PLAN_TABLE.find((r) => r.feature === "Google Calendar")?.paid).toBe(`Up to ${PAID_LIMITS.calendars}`);
    expect(JSON.stringify(MARKETING_PLANS)).not.toMatch(/Unlimited calendars/i);
  });
  it("shortens commit hashes", () => {
    expect(shortCommit("abcdef1234567890")).toBe("abcdef1");
    expect(shortCommit("nope")).toBe("dev");
  });
});
