import { describe, expect, it } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET, POST } from "@/app/api/admin/backup/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { cookieFor, req, useTestServer } from "@/test/server";

import { makeBackup, readBackup } from "./backup";
import { loadConfig, saveConfig } from "./config";

function withWifi(password: string, ssid = "Parinas Home"): DashboardConfig {
  const c = defaultConfig();
  for (const w of c.views.flatMap((v) => v.widgets)) {
    if (w.type === "wifiQr") {
      w.ssid = ssid;
      w.password = password;
    }
  }
  return c;
}

const wifiPasswords = (c: DashboardConfig) => c.views.flatMap((v) => v.widgets).flatMap((w) => (w.type === "wifiQr" ? [w.password] : []));

describe("settings backup", () => {
  useTestServer();

  it("holds the whole document, with WiFi passwords left out unless asked for", () => {
    const config = withWifi("hunter22");
    const stored = { config, version: 4, updatedAt: 0 };
    const plain = makeBackup(stored, { wifiPasswords: false }, new Date("2026-11-21T05:00:00Z"));
    expect(plain).toMatchObject({ kind: "everydaypane-settings", format: 1, version: 4, wifiPasswords: "left out" });
    expect(plain.exportedAt).toBe("2026-11-21T05:00:00.000Z");
    expect(wifiPasswords(plain.config).every((p) => p === "")).toBe(true);
    expect(JSON.stringify(plain)).not.toContain("hunter22");
    // Everything else is untouched, so a widget type added later is in the backup without changes here.
    expect({ ...plain.config, views: [] }).toEqual({ ...config, views: [] });
    expect(plain.config.views.map((v) => v.widgets.length)).toEqual(config.views.map((v) => v.widgets.length));
    expect(wifiPasswords(config)).toContain("hunter22");

    const full = makeBackup(stored, { wifiPasswords: true });
    expect(full.config).toEqual(config);
  });

  it("keeps the dashboard's WiFi password when the backup left it out", () => {
    const backup = JSON.parse(
      JSON.stringify(makeBackup({ config: withWifi("old-pass"), version: 1, updatedAt: 0 }, { wifiPasswords: false })),
    ) as unknown;
    const read = readBackup(backup, withWifi("current-pass"));
    expect(read.ok && wifiPasswords(read.config)).toEqual(expect.arrayContaining(["current-pass"]));
    expect(read.ok && wifiPasswords(read.config).includes("")).toBe(false);
  });

  it("restores the password a backup included", () => {
    const backup = JSON.parse(
      JSON.stringify(makeBackup({ config: withWifi("in-file"), version: 1, updatedAt: 0 }, { wifiPasswords: true })),
    ) as unknown;
    const read = readBackup(backup, withWifi("current-pass"));
    expect(read.ok && wifiPasswords(read.config)).toContain("in-file");
  });

  it("refuses files that aren't backups, newer formats and invalid settings", () => {
    const current = defaultConfig();
    expect(readBackup({ hello: "world" }, current)).toMatchObject({ ok: false, error: "That isn't an Everydaypane settings backup." });
    expect(readBackup({ kind: "everydaypane-settings", format: 2, config: current }, current)).toMatchObject({ ok: false });
    expect(readBackup({ kind: "everydaypane-settings", format: 1, config: { ...current, themeId: "nope" } }, current)).toMatchObject({
      ok: false,
      error: "The backup's settings aren't valid.",
    });
  });

  it("upgrades an older backup that lacks newer sections", () => {
    const old = defaultConfig() as unknown as Record<string, unknown>;
    delete old.burnIn;
    const read = readBackup({ kind: "everydaypane-settings", format: 1, config: old }, defaultConfig());
    expect(read.ok && read.config.burnIn).toEqual(defaultConfig().burnIn);
  });

  it("downloads and restores through the admin routes", async () => {
    const admin = await cookieFor("admin@example.com");
    const kid = await cookieFor("kid@example.com");
    const named = withWifi("secret-pass");
    named.name = "Kitchen";
    await saveConfig(LEGACY_ACCOUNT_ID, named, 0);

    expect((await GET(req("/api/admin/backup/", { headers: { cookie: kid } }))).status).toBe(401);
    const res = await GET(req("/api/admin/backup/", { headers: { cookie: admin } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="everydaypane-settings-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await res.text();
    expect(text).not.toContain("secret-pass");
    const withPass = await (await GET(req("/api/admin/backup/?wifi=1", { headers: { cookie: admin } }))).text();
    expect(withPass).toContain("secret-pass");

    const changed = withWifi("secret-pass");
    changed.name = "Hallway";
    await saveConfig(LEGACY_ACCOUNT_ID, changed, 1);

    const backup = JSON.parse(text) as unknown;
    const post = (b: object, cookie = admin) =>
      POST(req("/api/admin/backup/", { method: "POST", headers: { cookie }, body: JSON.stringify(b) }));
    expect((await post({ baseVersion: 2, backup }, kid)).status).toBe(401);

    const dry = await post({ baseVersion: 2, backup, dryRun: true });
    expect(await dry.json()).toEqual({ ok: true, summary: { views: 4, widgets: 23, themes: 8 } });
    expect((await loadConfig(LEGACY_ACCOUNT_ID)).config.name).toBe("Hallway");

    expect((await post({ baseVersion: 1, backup })).status).toBe(409);
    const done = await post({ baseVersion: 2, backup });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ ok: true, version: 3, config: { name: "Kitchen" } });
    const now = await loadConfig(LEGACY_ACCOUNT_ID);
    expect(now.config.name).toBe("Kitchen");
    expect(wifiPasswords(now.config)).toContain("secret-pass");

    expect((await post({ baseVersion: 3, backup: { kind: "other" } })).status).toBe(422);
    const cross = await POST(
      req("/api/admin/backup/", {
        method: "POST",
        headers: { cookie: admin, origin: "https://evil.example" },
        body: JSON.stringify({ baseVersion: 3, backup }),
      }),
    );
    expect(cross.status).toBe(403);
  });
});
