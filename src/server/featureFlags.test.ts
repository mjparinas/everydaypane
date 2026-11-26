import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { configVersion, saveConfig } from "./config";
import { run } from "./db";
import { clearFlag, flagsOffFresh, listFlags, loadDisplayConfig, setFlag } from "./featureFlags";

describe("feature flags", () => {
  useTestServer();

  it("starts with everything on", async () => {
    expect((await flagsOffFresh()).size).toBe(0);
    expect((await listFlags()).every((f) => f.value && f.fromDefault)).toBe(true);
  });

  it("turns a widget off for everyone and back to its default", async () => {
    await setFlag("widget.weather", false);
    expect((await flagsOffFresh()).has("widget.weather")).toBe(true);
    expect((await listFlags()).find((f) => f.name === "widget.weather")).toMatchObject({ value: false, fromDefault: false });

    await clearFlag("widget.weather");
    expect((await flagsOffFresh()).size).toBe(0);
  });

  it("ignores household overrides stored by the first version", async () => {
    // Melvin, 2026-11-26: unfinished widgets must not be switched on for one household.
    await run(
      "CREATE TABLE IF NOT EXISTS account_feature_flags (account_id TEXT NOT NULL, name TEXT NOT NULL, value INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, name))",
    );
    await run("INSERT INTO account_feature_flags (account_id, name, value, updated_at) VALUES (?, 'widget.weather', 1, 1)", [
      LEGACY_ACCOUNT_ID,
    ]);
    await setFlag("widget.weather", false);
    await saveConfig(LEGACY_ACCOUNT_ID, defaultConfig(), 0);
    const shown = await loadDisplayConfig(LEGACY_ACCOUNT_ID, { fresh: true });
    expect(shown.config.views.some((v) => v.widgets.some((w) => w.type === "weather"))).toBe(false);
  });

  it("refuses names outside the registry", async () => {
    await expect(setFlag("widget.nope", false)).rejects.toThrow(/Unknown flag/);
  });

  it("reads a switch from the old Flags tab under its new name", async () => {
    await run("INSERT INTO feature_flags (name, value, share, updated_at) VALUES ('earth_map', 'false', 100, 1)");
    expect((await flagsOffFresh()).has("widget.earth")).toBe(true);
    await clearFlag("widget.earth");
    expect((await flagsOffFresh()).has("widget.earth")).toBe(false);
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
