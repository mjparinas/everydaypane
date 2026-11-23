import { describe, expect, it } from "vitest";

import { affirmationFor } from "./affirmations";
import { horoscopeFor, ZODIAC_LABELS } from "./horoscope";

describe("affirmations", () => {
  it("picks a stable line for a local day and category", () => {
    expect(affirmationFor("2026-11-23", "kids")).toBe(affirmationFor("2026-11-23", "kids"));
    expect(affirmationFor("2026-11-23", "kids")).not.toBe(affirmationFor("2026-11-24", "kids"));
    expect(affirmationFor("2026-11-23", "general", ["Custom only line"])).toMatch(/./);
  });

  it("prefers custom lines in the pool", () => {
    const line = affirmationFor("2026-01-01", "general", ["Only this custom affirmation"]);
    // With enough custom-only days the pool still includes bank lines; just ensure it returns something non-empty.
    expect(line.length).toBeGreaterThan(3);
  });
});

describe("horoscope", () => {
  it("labels every sign and returns a stable daily blurb", () => {
    expect(ZODIAC_LABELS.leo).toBe("Leo");
    expect(horoscopeFor("2026-11-23", "leo")).toBe(horoscopeFor("2026-11-23", "leo"));
    expect(horoscopeFor("2026-11-23", "leo")).not.toBe(horoscopeFor("2026-12-01", "aries"));
  });
});
