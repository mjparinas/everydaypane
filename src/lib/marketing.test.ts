import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { postBySlug, POSTS, type Figure } from "../content/posts";
import { shortCommit } from "./build";
import { COMPETITORS } from "./compare";
import { MARKETING_PLAN_TABLE, MARKETING_PLANS } from "./marketingPlans";
import { FREE_LIMITS, PAID_LIMITS } from "./plans";

/** Pixel size of a PNG or WebP (lossy VP8, lossless VP8L or extended VP8X), read from its header. */
function imageSize(file: string): { w: number; h: number } {
  const b = readFileSync(join(process.cwd(), "public", file));
  if (b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: not a PNG or WebP`);
}

describe("marketing content", () => {
  it("gives every blog picture a real file with its stated size", () => {
    const figures: Figure[] = POSTS.flatMap((p) => p.body.flatMap((b) => ("img" in b ? [b.img] : "gallery" in b ? b.gallery : [])));
    expect(figures.length).toBeGreaterThan(40);
    for (const f of figures) {
      expect(f.alt.length, f.src).toBeGreaterThan(10);
      expect(imageSize(f.src), f.src).toEqual({ w: f.w, h: f.h });
    }
  });

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
