import { describe, expect, it } from "vitest";

import { formatDeviceCode, normalizeDeviceCode } from "@/lib/deviceSignIn";
import { cookieFor, req, useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { SESSION_COOKIE } from "./auth";
import {
  approveDeviceSignIn,
  claimDeviceSignIn,
  DEVICE_SIGN_IN_MS,
  pollDeviceSignIn,
  selectDisplayUnlock,
  startDeviceSignIn,
} from "./deviceSignIn";
import { DISPLAY_COOKIE, WALL_COOKIE } from "./displayAuth";
import { addDevice, deviceForToken } from "./devices";

describe("device code helpers", () => {
  it("normalises dashed codes and rejects bad ones", () => {
    expect(normalizeDeviceCode("k7qf-29md")).toBe("K7QF29MD");
    expect(formatDeviceCode("K7QF29MD")).toBe("K7QF-29MD");
    expect(normalizeDeviceCode("SHORT")).toBeNull();
    expect(normalizeDeviceCode("IIIIIIII")).toBeNull(); // I not in alphabet
  });
});

describe("phone QR wall unlock", () => {
  useTestServer();

  async function start() {
    const r = await startDeviceSignIn(req("/api/auth/device/start/", { method: "POST" }), "http://localhost");
    expect(r.status).toBe(200);
    return (await r.json()) as { code: string; pollSecret: string; qrSvg: string; phoneUrl: string };
  }

  it("lets a signed-in phone pick a display and the wall claims display cookies", async () => {
    const { device, token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const started = await start();
    expect(started.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(started.qrSvg).toContain("<svg");
    expect(started.phoneUrl).toContain("/signin/phone/?code=");

    const pending = await pollDeviceSignIn(req("/api/auth/device/poll/", { method: "POST" }), started.code, started.pollSecret);
    expect(await pending.json()).toEqual({ status: "pending" });

    const cookie = await cookieFor("admin@example.com");
    const withoutDevice = await approveDeviceSignIn(
      req("/api/auth/device/approve/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
      "",
    );
    expect(withoutDevice.status).toBe(400);

    const approved = await approveDeviceSignIn(
      req("/api/auth/device/approve/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
      device.id,
    );
    expect(approved.status).toBe(200);

    const ready = await pollDeviceSignIn(
      req("/api/auth/device/poll/", { method: "POST", ip: "1.2.3.4" }),
      started.code,
      started.pollSecret,
    );
    const readyBody = (await ready.json()) as { status: string; handoff?: string; deviceId?: string };
    expect(readyBody.status).toBe("ready");
    expect(readyBody.handoff).toBeTruthy();
    expect(readyBody.deviceId).toBe(device.id);

    const again = await pollDeviceSignIn(
      req("/api/auth/device/poll/", { method: "POST", ip: "1.2.3.4" }),
      started.code,
      started.pollSecret,
    );
    expect(await again.json()).toEqual(readyBody);

    const claimed = await claimDeviceSignIn(req("/api/auth/device/claim/", { method: "POST" }), readyBody.handoff!);
    expect(claimed.status).toBe(200);
    const setCookies = claimed.headers.getSetCookie?.() ?? [claimed.headers.get("Set-Cookie") ?? ""];
    const joined = setCookies.join("\n");
    expect(joined).toContain(`${WALL_COOKIE}=`);
    expect(joined).toContain(`${DISPLAY_COOKIE}=`);
    expect(joined).not.toContain(`${SESSION_COOKIE}=`);
    expect(await deviceForToken(token)).toMatchObject({ id: device.id });

    const reuse = await claimDeviceSignIn(req("/api/auth/device/claim/", { method: "POST", ip: "5.5.5.5" }), readyBody.handoff!);
    expect(reuse.status).toBe(410);
  });

  it("rejects a device from another household", async () => {
    const { device } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const started = await start();
    const cookie = await cookieFor("admin@example.com");
    const r = await approveDeviceSignIn(
      req("/api/auth/device/approve/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
      "not-a-real-device-id",
    );
    expect(r.status).toBe(404);
    expect(device.id).toBeTruthy();
  });

  it("lets a signed-in wall pick a display without QR", async () => {
    const { device } = await addDevice(LEGACY_ACCOUNT_ID, "Hall", null);
    const cookie = await cookieFor("admin@example.com");
    const r = await selectDisplayUnlock(
      req("/api/auth/device/select/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      device.id,
    );
    expect(r.status).toBe(200);
    const setCookies = r.headers.getSetCookie?.() ?? [r.headers.get("Set-Cookie") ?? ""];
    expect(setCookies.join("\n")).toContain(`${WALL_COOKIE}=`);
  });

  it("rejects a wrong poll secret", async () => {
    const started = await start();
    const r = await pollDeviceSignIn(req("/api/auth/device/poll/", { method: "POST" }), started.code, "not-the-real-secret-value-xxxxxx");
    expect(await r.json()).toEqual({ status: "expired" });
  });

  it("expires after ten minutes", async () => {
    const { device } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const started = await start();
    const cookie = await cookieFor("admin@example.com");
    const now = Date.now();
    await approveDeviceSignIn(
      req("/api/auth/device/approve/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
      device.id,
      now,
    );
    const late = await pollDeviceSignIn(
      req("/api/auth/device/poll/", { method: "POST" }),
      started.code,
      started.pollSecret,
      now + DEVICE_SIGN_IN_MS + 1,
    );
    expect(await late.json()).toEqual({ status: "expired" });
  });
});
