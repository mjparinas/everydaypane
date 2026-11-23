import { describe, expect, it } from "vitest";

import { postBySlug, POSTS } from "../content/posts";
import { shortCommit } from "./build";
import { COMPETITORS } from "./compare";
import { MARKETING_PLANS } from "./marketingPlans";

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
  it("shortens commit hashes", () => {
    expect(shortCommit("abcdef1234567890")).toBe("abcdef1");
    expect(shortCommit("nope")).toBe("dev");
  });
});
