import { describe, expect, it } from "vitest";

import { mapEcobeeThermostat, parseEcobeeThermostats } from "./ecobee";

const NOW = Date.parse("2026-11-23T12:00:00Z");

describe("ecobee mapping", () => {
  it("converts Fahrenheit runtime to Celsius on the feed", () => {
    const entity = mapEcobeeThermostat(
      {
        identifier: "t123",
        name: "Main floor",
        settings: { hvacMode: "heat", heatTemp: 680, coolTemp: 780 },
        runtime: { actualTemperature: 700, desiredHeat: 680 },
      },
      NOW,
    );
    expect(entity).toMatchObject({
      id: "ecobee.t123",
      name: "Main floor",
      state: "heat",
      current: 21.1,
      target: 20,
    });
  });

  it("parses a thermostat list", () => {
    const rows = parseEcobeeThermostats({ thermostatList: [{ identifier: "x", name: "Upstairs", settings: { hvacMode: "off" } }] }, NOW);
    expect(rows[0]?.id).toBe("ecobee.x");
  });
});
