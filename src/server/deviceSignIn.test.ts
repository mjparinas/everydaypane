import { describe, expect, it } from "vitest";

import { formatDeviceCode, normalizeDeviceCode } from "@/lib/deviceSignIn";
import { cookieFor, req, useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { SESSION_COOKIE, sessionFor } from "./auth";
import { approveDeviceSignIn, claimDeviceSignIn, DEVICE_SIGN_IN_MS, pollDeviceSignIn, startDeviceSignIn } from "./deviceSignIn";

describe("device code helpers", () => {
  it("normalises dashed codes and rejects bad ones", () => {
    expect(normalizeDeviceCode("k7qf-29md")).toBe("K7QF29MD");
    expect(formatDeviceCode("K7QF29MD")).toBe("K7QF-29MD");
    expect(normalizeDeviceCode("SHORT")).toBeNull();
    expect(normalizeDeviceCode("IIIIIIII")).toBeNull(); // I not in alphabet
  });
});

describe("phone QR sign-in", () => {
  useTestServer();

  async function start() {
    const r = await startDeviceSignIn(req("/api/auth/device/start/", { method: "POST" }), "http://localhost");
    expect(r.status).toBe(200);
    return (await r.json()) as { code: string; pollSecret: string; qrSvg: string; phoneUrl: string };
  }

  it("lets a signed-in phone approve a display, which then claims a session", async () => {
    const started = await start();
    expect(started.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(started.qrSvg).toContain("<svg");
    expect(started.phoneUrl).toContain("/signin/phone/?code=");

    const pending = await pollDeviceSignIn(req("/api/auth/device/poll/", { method: "POST" }), started.code, started.pollSecret);
    expect(await pending.json()).toEqual({ status: "pending" });

    const cookie = await cookieFor("admin@example.com");
    const approveReq = req("/api/auth/device/approve/", { method: "POST", headers: { cookie } });
    const approved = await approveDeviceSignIn(
      approveReq,
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
    );
    expect(approved.status).toBe(200);

    const ready = await pollDeviceSignIn(
      req("/api/auth/device/poll/", { method: "POST", ip: "1.2.3.4" }),
      started.code,
      started.pollSecret,
    );
    const readyBody = (await ready.json()) as { status: string; handoff?: string; role?: string };
    expect(readyBody.status).toBe("ready");
    expect(readyBody.handoff).toBeTruthy();
    expect(readyBody.role).toBe("admin");

    // Second poll no longer re-issues the sealed handoff.
    const again = await pollDeviceSignIn(
      req("/api/auth/device/poll/", { method: "POST", ip: "1.2.3.4" }),
      started.code,
      started.pollSecret,
    );
    expect(await again.json()).toEqual({ status: "pending" });

    const claimed = await claimDeviceSignIn(req("/api/auth/device/claim/", { method: "POST" }), readyBody.handoff!);
    expect(claimed.status).toBe(200);
    const setCookie = claimed.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    const token = /ep_session=([^;]+)/.exec(setCookie)?.[1];
    expect(await sessionFor(token)).toMatchObject({ email: "admin@example.com", role: "admin" });

    const reuse = await claimDeviceSignIn(req("/api/auth/device/claim/", { method: "POST", ip: "5.5.5.5" }), readyBody.handoff!);
    expect(reuse.status).toBe(410);
  });

  it("rejects a wrong poll secret", async () => {
    const started = await start();
    const r = await pollDeviceSignIn(req("/api/auth/device/poll/", { method: "POST" }), started.code, "not-the-real-secret-value-xxxxxx");
    expect(await r.json()).toEqual({ status: "expired" });
  });

  it("expires after ten minutes", async () => {
    const started = await start();
    const cookie = await cookieFor("admin@example.com");
    const now = Date.now();
    await approveDeviceSignIn(
      req("/api/auth/device/approve/", { method: "POST", headers: { cookie } }),
      { email: "admin@example.com", accountId: LEGACY_ACCOUNT_ID, role: "admin" },
      started.code,
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
