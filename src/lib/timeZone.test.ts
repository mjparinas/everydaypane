import { describe, expect, it } from "vitest";

import { reliableTimeZone, zonedFormatter } from "./timeZone";

describe("reliableTimeZone", () => {
  it("uses Vancouver's historical rules before the 2026 transition", () => {
    expect(reliableTimeZone("America/Vancouver", new Date("2026-03-08T09:59:59Z"))).toBe("America/Vancouver");
  });

  it("uses fixed UTC-7 after B.C. adopts permanent daylight time", () => {
    const instant = new Date("2026-11-17T20:15:00Z");
    expect(reliableTimeZone("America/Vancouver", instant)).toBe("Etc/GMT+7");
    expect(zonedFormatter("America/Vancouver", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant)).toBe("13:15");
  });

  it("does not change other time zones", () => {
    expect(reliableTimeZone("America/Toronto", new Date("2026-11-17T20:15:00Z"))).toBe("America/Toronto");
  });
});
