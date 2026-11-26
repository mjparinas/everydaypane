import { describe, expect, it } from "vitest";

import { dayOrder, familyFriendly, parseOnThisDay } from "./onThisDay";

// Trimmed from en.wikipedia.org/api/rest_v1/feed/onthisday/selected/11/26 and /births/11/26.
const feed = {
  selected: [
    { text: "The first jukebox goes into operation at the Palais Royale Saloon in San Francisco.", year: 1889, pages: [] },
    { text: "Thousands are killed when a flood breaks a dam.", year: 1950, pages: [] },
    { text: "  Lots   of\nspace. ", year: 2003 },
    { text: "No year" },
  ],
  births: [{ text: "Charles M. Schulz, American cartoonist (d. 2000)", year: 1922 }],
};

describe("on this day", () => {
  it("reads events and births", () => {
    expect(parseOnThisDay(feed, "events")).toEqual([
      { year: 1889, text: "The first jukebox goes into operation at the Palais Royale Saloon in San Francisco." },
      { year: 1950, text: "Thousands are killed when a flood breaks a dam." },
      { year: 2003, text: "Lots of space." },
    ]);
    expect(parseOnThisDay(feed, "births")).toEqual([{ year: 1922, text: "Charles M. Schulz, American cartoonist (d. 2000)" }]);
    expect(parseOnThisDay(null, "events")).toEqual([]);
  });

  it("keeps grim history off the kitchen wall", () => {
    expect(familyFriendly("The first jukebox goes into operation.")).toBe(true);
    expect(familyFriendly("Thousands are killed when a flood breaks a dam.")).toBe(false);
    expect(familyFriendly("The Battle of Hastings is fought.")).toBe(false);
    expect(familyFriendly("Warsaw hosts its first opera.")).toBe(true);
  });

  it("orders the same way all day and differently the next", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(dayOrder(items, "2026-11-26")).toEqual(dayOrder(items, "2026-11-26"));
    expect(dayOrder(items, "2026-11-26")).not.toEqual(dayOrder(items, "2026-11-27"));
    expect([...dayOrder(items, "2026-11-26")].sort()).toEqual(items);
  });
});
