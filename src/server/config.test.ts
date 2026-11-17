import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import { configVersion, loadConfig, saveConfig, touchConfig } from "./config";

describe("config store", () => {
  useTestServer();

  it("serves the default dashboard before the first save", async () => {
    const { config, version } = await loadConfig();
    expect(version).toBe(0);
    expect(config.name).toBe("Everydaypane");
  });

  it("saves, bumps the version and refuses a stale save", async () => {
    const c = defaultConfig();
    c.name = "Kitchen";
    expect(await saveConfig(c, 0)).toEqual({ ok: true, version: 1 });
    expect((await loadConfig()).config.name).toBe("Kitchen");
    expect(await saveConfig(c, 1)).toEqual({ ok: true, version: 2 });
    const stale = await saveConfig(c, 1);
    expect(stale.ok).toBe(false);
    expect(stale.ok === false && stale.status).toBe(409);
    expect(await saveConfig(c, 0)).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses an invalid document and keeps the old one", async () => {
    await saveConfig(defaultConfig(), 0);
    expect(await saveConfig({ name: "" }, 1)).toMatchObject({ ok: false, status: 422 });
    expect(await configVersion()).toBe(1);
  });

  it("bumps the version on touch so displays reload", async () => {
    await touchConfig();
    expect(await configVersion()).toBe(1);
    await touchConfig();
    expect(await configVersion()).toBe(2);
  });
});
