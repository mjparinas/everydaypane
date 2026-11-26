import { describe, expect, it } from "vitest";

import { WIDGET_TYPES } from "./config/widgets";
import { FEATURE_FLAGS } from "./featureFlags";
import { keyState, keyVarNames, PLATFORM_KEYS, unconfiguredFlags } from "./platformKeys";

const key = (id: string) => PLATFORM_KEYS.find((k) => k.id === id)!;
const env =
  (...names: string[]) =>
  (n: string) =>
    names.includes(n);

describe("platform keys", () => {
  it("unlocks only real flag names", () => {
    const known = new Set(FEATURE_FLAGS.map((f) => f.name));
    for (const k of PLATFORM_KEYS) for (const name of k.unlocks) expect(known.has(name), `${k.id} → ${name}`).toBe(true);
  });

  it("has unique ids", () => {
    expect(new Set(PLATFORM_KEYS.map((k) => k.id)).size).toBe(PLATFORM_KEYS.length);
  });

  it("reads set, partly set and missing", () => {
    expect(keyState(key("tomtom"), env("TOMTOM_API_KEY"))).toBe("set");
    expect(keyState(key("tomtom"), env())).toBe("missing");
    expect(keyState(key("oura"), env("OURA_CLIENT_ID"))).toBe("partly");
    expect(keyState(key("oura"), env("OURA_CLIENT_ID", "OURA_CLIENT_SECRET"))).toBe("set");
  });

  it("lets Nest borrow the Google client", () => {
    expect(keyState(key("nest"), env("NEST_PROJECT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"))).toBe("set");
    expect(keyState(key("nest"), env("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"))).toBe("partly");
    expect(keyVarNames(key("nest"))).toEqual([
      "NEST_PROJECT_ID",
      "NEST_CLIENT_ID or GOOGLE_CLIENT_ID",
      "NEST_CLIENT_SECRET or GOOGLE_CLIENT_SECRET",
    ]);
  });

  it("hides widgets and providers whose every key is missing", () => {
    const hidden = new Set(unconfiguredFlags(new Set()));
    expect(hidden.has("widget.gasPrices")).toBe(true);
    expect(hidden.has("widget.commute")).toBe(true);
    expect(hidden.has("music.spotify")).toBe(true);
    expect(hidden.has("widget.tasks")).toBe(true);
    // Household-pasted keys and keyless widgets are never hidden.
    for (const t of ["govee", "unifi", "airthings", "blueRiiot", "transit", "ynab", "weather"]) {
      expect(hidden.has(`widget.${t}`), t).toBe(false);
    }
    expect(hidden.has("smartHome.govee")).toBe(false);
    expect(hidden.has("smartHome.lifx")).toBe(false);
  });

  it("keeps a widget that any one of its keys unlocks", () => {
    const hidden = new Set(unconfiguredFlags(new Set(["todoist"])));
    expect(hidden.has("widget.tasks")).toBe(false);
    expect(hidden.has("tasks.todoist")).toBe(false);
    expect(hidden.has("tasks.google")).toBe(true);
  });

  it("hides nothing once every key is set", () => {
    expect(unconfiguredFlags(new Set(PLATFORM_KEYS.map((k) => k.id)))).toEqual([]);
    expect(WIDGET_TYPES.length).toBeGreaterThan(0);
  });
});
