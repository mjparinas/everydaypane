import { describe, expect, it } from "vitest";

import { upcoming } from "./countdown";
import type { CountdownEvent } from "./schema";

const ev = (over: Partial<CountdownEvent>): CountdownEvent => ({
  id: "e",
  name: "Event",
  date: "2026-12-25",
  emoji: "",
  kind: "holiday",
  yearly: true,
  ...over,
});

describe("countdowns", () => {
  it("rolls yearly events to next year once passed, and sorts soonest first", () => {
    const list = upcoming([ev({ id: "x", name: "Christmas" }), ev({ id: "c", name: "Canada Day", date: "2020-07-01" })], "2026-11-17");
    expect(list.map((u) => [u.event.name, u.date, u.days])).toEqual([
      ["Christmas", "2026-12-25", 38],
      ["Canada Day", "2027-07-01", 226],
    ]);
  });

  it("shows today as zero days", () => {
    expect(upcoming([ev({ date: "2000-11-17" })], "2026-11-17")[0]?.days).toBe(0);
  });

  it("drops one-off events in the past", () => {
    expect(upcoming([ev({ yearly: false, date: "2026-01-01" })], "2026-11-17")).toEqual([]);
  });

  it("says how old someone turns", () => {
    expect(upcoming([ev({ kind: "birthday", date: "2015-03-02", name: "Sam" })], "2026-11-17")[0]?.turning).toBe(12);
  });

  it("celebrates a 29 February birthday on the 28th in other years", () => {
    expect(upcoming([ev({ kind: "birthday", date: "2016-02-29" })], "2026-11-17")[0]?.date).toBe("2027-02-28");
    expect(upcoming([ev({ kind: "birthday", date: "2016-02-29" })], "2027-03-01")[0]?.date).toBe("2028-02-29");
  });
});
