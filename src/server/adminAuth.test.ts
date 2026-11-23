import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ADMIN_COOKIE, roleOf, staffEnabled, startAdminSignIn } from "./adminAuth";
import { resetForTests } from "./db";

describe("adminAuth", () => {
  const prevAdmin = process.env.ADMIN_EMAILS;
  const prevSupport = process.env.SUPPORT_EMAILS;

  beforeEach(() => {
    resetForTests();
    process.env.ADMIN_EMAILS = "ops@example.com";
    process.env.SUPPORT_EMAILS = "help@example.com";
    process.env.SESSION_SECRET = "x".repeat(32);
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = prevAdmin;
    process.env.SUPPORT_EMAILS = prevSupport;
    resetForTests();
  });

  it("assigns admin and support roles", () => {
    expect(staffEnabled()).toBe(true);
    expect(roleOf("ops@example.com")).toBe("admin");
    expect(roleOf("help@example.com")).toBe("support");
    expect(roleOf("stranger@example.com")).toBeNull();
  });

  it("returns the same message for unknown emails and a dev link for staff without Resend", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.VERCEL_ENV = "development";
    const unknown = await startAdminSignIn(new Request("http://localhost/api/admin/login/", { method: "POST" }), "nope@example.com");
    expect(unknown.status).toBe(200);
    const u = (await unknown.json()) as { ok: boolean; devLink?: string };
    expect(u.ok).toBe(true);
    expect(u.devLink).toBeUndefined();

    const known = await startAdminSignIn(new Request("http://localhost/api/admin/login/", { method: "POST" }), "ops@example.com");
    const k = (await known.json()) as { ok: boolean; devLink?: string };
    expect(k.ok).toBe(true);
    expect(k.devLink).toContain("/api/admin/login/?token=");
    expect(ADMIN_COOKIE).toBe("ep_admin");
  });
});
