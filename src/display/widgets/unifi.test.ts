// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { downtime, health, sparkPaths } from "./unifi";

describe("UniFi network widget", () => {
  it("calls the line slow from the widget's latency or 2 % packet loss, and down only from the server", () => {
    expect(health({ status: "ok", latency: 20, packetLoss: 0 }, 100)).toBe("ok");
    expect(health({ status: "ok", latency: 100 }, 100)).toBe("slow");
    expect(health({ status: "ok", latency: 20, packetLoss: 2.5 }, 100)).toBe("slow");
    expect(health({ status: "down", latency: 5 }, 100)).toBe("down");
    expect(health({ status: "ok" }, 100)).toBe("ok");
  });

  it("says how long the internet was down", () => {
    expect(downtime(0)).toBe("No outages in 24 h");
    expect(downtime(7)).toBe("Down 7 min in 24 h");
    expect(downtime(60)).toBe("Down 1 h in 24 h");
    expect(downtime(135)).toBe("Down 2 h 15 min in 24 h");
  });

  it("breaks the sparkline where there was no reading", () => {
    expect(sparkPaths([10, 20, null, 20, 10])).toEqual(["0,12 25,2", "75,2 100,12"]);
    expect(sparkPaths([null, 5, null])).toEqual([]);
  });
});
