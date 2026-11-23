import { describe, expect, it } from "vitest";

import { mapNestDevice, parseNestDevices } from "./nest";

const NOW = Date.parse("2026-11-23T12:00:00Z");

describe("Nest SDM mapping", () => {
  it("maps a thermostat with heat setpoint and ambient temperature", () => {
    const entity = mapNestDevice(
      {
        name: "enterprises/proj/devices/abc123",
        type: "sdm.devices.types.THERMOSTAT",
        parentRelations: [{ displayName: "Hallway" }],
        traits: {
          "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 21.2 },
          "sdm.devices.traits.ThermostatTemperatureSetpoint": { heatCelsius: 20.5 },
          "sdm.devices.traits.ThermostatMode": { mode: "HEAT" },
        },
      },
      NOW,
    );
    expect(entity).toMatchObject({
      id: "nest.abc123",
      name: "Hallway",
      state: "heat",
      current: 21.2,
      target: 20.5,
      unit: "°C",
    });
  });

  it("maps an On/Off light", () => {
    const entity = mapNestDevice(
      {
        name: "enterprises/proj/devices/light_1",
        type: "sdm.devices.types.LIGHT",
        traits: {
          "sdm.devices.traits.OnOff": { status: true },
          "sdm.devices.traits.Brightness": { brightnessPercent: 80 },
        },
      },
      NOW,
    );
    expect(entity).toMatchObject({ id: "nest.light_1", state: "on", brightness: 204 });
  });

  it("lists devices from a recorded list response", () => {
    const list = parseNestDevices(
      {
        devices: [
          {
            name: "enterprises/p/devices/t1",
            traits: { "sdm.devices.traits.Humidity": { ambientHumidityPercent: 48 } },
          },
        ],
      },
      NOW,
    );
    expect(list[0]?.id).toBe("nest.t1");
  });
});
