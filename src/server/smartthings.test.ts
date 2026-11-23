import { describe, expect, it } from "vitest";

import { mapSmartThingsDevice } from "./smartthings";

const NOW = Date.parse("2026-11-23T12:00:00Z");

describe("SmartThings mapping", () => {
  it("maps a switch with level", () => {
    const entity = mapSmartThingsDevice(
      {
        deviceId: "aaa-bbb",
        name: "Kitchen light",
        components: [
          {
            capabilities: [
              { id: "switch", status: { value: "on" } },
              { id: "switchLevel", status: { value: "75" } },
            ],
          },
        ],
      },
      NOW,
    );
    expect(entity).toMatchObject({ id: "smartthings.aaa_bbb", state: "on", brightness: 191 });
  });

  it("maps a thermostat", () => {
    const entity = mapSmartThingsDevice(
      {
        deviceId: "therm1",
        name: "Thermostat",
        components: [
          {
            capabilities: [
              { id: "temperatureMeasurement", status: { value: "20.5", unit: "C" } },
              { id: "thermostatHeatingSetpoint", status: { value: "21" } },
              { id: "thermostatMode", status: { value: "heat" } },
            ],
          },
        ],
      },
      NOW,
    );
    expect(entity).toMatchObject({ id: "smartthings.therm1", state: "heat", current: 20.5, target: 21 });
  });
});
