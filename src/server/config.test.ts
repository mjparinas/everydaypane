import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { configSchema } from "@/lib/config/schema";
import { useTestServer } from "@/test/server";

import { configVersion, loadConfig, saveConfig, touchConfig, upgrade } from "./config";
import { getSecret, setSecret } from "./secrets";

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

  it("maps the old sunTimes transparent flag and keeps clocks without a panel", () => {
    const c = structuredClone(defaultConfig()) as unknown as Record<string, unknown>;
    const views = c.views as { widgets: Record<string, unknown>[] }[];
    views[0]!.widgets = [
      { id: "sun", type: "sunTimes", x: 0, y: 0, w: 3, h: 2, transparent: true },
      {
        id: "clk",
        type: "clock",
        x: 3,
        y: 0,
        w: 3,
        h: 2,
        timeZone: "America/Vancouver",
        label: "Vancouver",
        showSeconds: false,
        style: "digital",
      },
    ];
    const upgraded = upgrade(c);
    const parsed = configSchema.safeParse(upgraded);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const [sun, clock] = parsed.data.views[0]!.widgets;
    expect(sun).toMatchObject({ type: "sunTimes", showBackground: false });
    expect(sun).not.toHaveProperty("transparent");
    expect(clock).toMatchObject({ type: "clock", showBackground: false });
  });

  it("appends built-in colour schemes that a saved document is missing", () => {
    const c = defaultConfig();
    const kept = structuredClone(c.themes[0]!);
    kept.name = "My Aurora";
    c.themes = [kept];
    const parsed = configSchema.safeParse(upgrade(c));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.themes.map((t) => t.id)).toEqual(defaultConfig().themes.map((t) => t.id));
    expect(parsed.data.themes[0]).toMatchObject({ id: "aurora", name: "My Aurora" });
  });

  it("refuses a private Home Assistant address and clears secrets when the URL changes", async () => {
    const c = defaultConfig();
    c.integrations.homeAssistant.url = "https://ha.example.com";
    expect(await saveConfig(c, 0)).toEqual({ ok: true, version: 1 });
    await setSecret("homeAssistant.token", "ha-token");
    await setSecret("homeAssistant.accessId", "cf-id");
    await setSecret("homeAssistant.accessSecret", "cf-secret");

    const bad = structuredClone((await loadConfig()).config);
    bad.integrations.homeAssistant.url = "https://127.0.0.1:8123";
    expect(await saveConfig(bad, 1)).toMatchObject({ ok: false, status: 422 });
    expect(await getSecret("homeAssistant.token")).toBe("ha-token");

    const moved = structuredClone((await loadConfig()).config);
    moved.integrations.homeAssistant.url = "https://ha-evil.example.com";
    expect(await saveConfig(moved, 1)).toEqual({ ok: true, version: 2 });
    expect(await getSecret("homeAssistant.token")).toBeNull();
    expect(await getSecret("homeAssistant.accessId")).toBeNull();
    expect(await getSecret("homeAssistant.accessSecret")).toBeNull();
  });
});
