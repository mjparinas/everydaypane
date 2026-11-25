import { describe, expect, it } from "vitest";

import { POST as deviceSignoutPOST } from "@/app/api/auth/device/signout/route";
import { GET as legacyDisplayGET } from "@/app/d/[token]/route";
import { GET as displayGET } from "@/app/display/route";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { addDevice, deviceForToken } from "@/server/devices";
import { DISPLAY_COOKIE, WALL_COOKIE, wallCookieHeader } from "@/server/displayAuth";
import { req, useTestServer } from "@/test/server";

describe("display gate", () => {
  useTestServer();

  it("redirects bare /d/<token>/ to /display/", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await legacyDisplayGET(req(`http://localhost/d/${token}/`));
    expect(r.status).toBe(308);
    expect(r.headers.get("Location")).toMatch(/\/display\/$/);
  });

  it("sends locked browsers to /display/unlock/", async () => {
    const r = await displayGET(req("http://localhost/display/"));
    expect(r.status).toBe(307);
    expect(r.headers.get("Location")).toMatch(/\/display\/unlock\/$/);
    expect(r.headers.get("Cache-Control")).toMatch(/no-store/);
  });

  it("serves the dashboard HTML when ep_wall is valid", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const cookie = wallCookieHeader(token).split(";")[0]!;
    const r = await displayGET(req("http://localhost/display/", { headers: { cookie } }));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(`data-token="${token}"`);
    expect(html).toContain("/display/display.js");
    const setCookies = r.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((c) => c.startsWith(`${WALL_COOKIE}=`))).toBe(true);
  });

  it("soft-locks by clearing both display cookies without rotating the device token", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await deviceSignoutPOST(req("/api/auth/device/signout/", { method: "POST", body: "{}" }));
    expect(r.status).toBe(200);
    const setCookies = r.headers.getSetCookie?.() ?? [];
    const joined = setCookies.join("\n");
    expect(joined).toMatch(new RegExp(`${WALL_COOKIE}=;.*Max-Age=0`));
    expect(joined).toMatch(new RegExp(`${DISPLAY_COOKIE}=;.*Max-Age=0`));
    expect(await deviceForToken(token)).toBeTruthy();
  });
});
