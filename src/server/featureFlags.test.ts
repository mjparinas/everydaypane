import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { configVersion, saveConfig } from "./config";
import { run } from "./db";
import { clearFlag, flagsOffFresh, listFlags, listHouseholdFlags, loadDisplayConfig, setFlag, setHouseholdFlag } from "./featureFlags";

describe("feature flags", () => {
  useTestServer();

  it("starts with everything on", async () => {
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).size).toBe(0);
    expect((await listFlags()).every((f) => f.value && f.fromDefault)).toBe(true);
  });

  it("turns a widget off for everyone, and a household override wins", async () => {
    await setFlag("widget.weather", false);
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("widget.weather")).toBe(true);
    expect((await flagsOffFresh("acct_other")).has("widget.weather")).toBe(true);

    await setHouseholdFlag(LEGACY_ACCOUNT_ID, "widget.weather", true);
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("widget.weather")).toBe(false);
    const row = (await listHouseholdFlags(LEGACY_ACCOUNT_ID)).find((f) => f.name === "widget.weather");
    expect(row).toMatchObject({ value: false, override: true, effective: true });

    await setHouseholdFlag(LEGACY_ACCOUNT_ID, "widget.weather", null);
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("widget.weather")).toBe(true);

    await clearFlag("widget.weather");
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).size).toBe(0);
  });

  it("can switch one household off while the platform stays on", async () => {
    await setHouseholdFlag(LEGACY_ACCOUNT_ID, "smartHome.govee", false);
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("smartHome.govee")).toBe(true);
    expect((await flagsOffFresh("acct_other")).has("smartHome.govee")).toBe(false);
  });

  it("refuses names outside the registry", async () => {
    await expect(setFlag("widget.nope", false)).rejects.toThrow(/Unknown flag/);
    await expect(setHouseholdFlag(LEGACY_ACCOUNT_ID, "nope", false)).rejects.toThrow(/Unknown flag/);
  });

  it("reads a switch from the old Flags tab under its new name", async () => {
    await run("INSERT INTO feature_flags (name, value, share, updated_at) VALUES ('earth_map', 'false', 100, 1)");
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("widget.earth")).toBe(true);
    await clearFlag("widget.earth");
    expect((await flagsOffFresh(LEGACY_ACCOUNT_ID)).has("widget.earth")).toBe(false);
  });

  it("drops switched-off widgets from the display's copy and reloads only walls that use them", async () => {
    const c = defaultConfig();
    expect(c.views.some((v) => v.widgets.some((w) => w.type === "weather"))).toBe(true);
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, c, 0);
    expect(saved.ok).toBe(true);
    const before = await configVersion(LEGACY_ACCOUNT_ID);

    await setFlag("widget.windy", false);
    expect(await configVersion(LEGACY_ACCOUNT_ID)).toBe(before);

    await setFlag("widget.weather", false);
    expect(await configVersion(LEGACY_ACCOUNT_ID)).toBe(before + 1);
    const shown = await loadDisplayConfig(LEGACY_ACCOUNT_ID, { fresh: true });
    expect(shown.config.views.some((v) => v.widgets.some((w) => w.type === "weather"))).toBe(false);
    expect(shown.version).toBe(before + 1);
  });
});
