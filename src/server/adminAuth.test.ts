import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cookieFor, useTestServer } from "@/test/server";

import { ADMIN_COOKIE, getStaff, getStaffSession, roleOf, staffEnabled, startAdminSignIn } from "./adminAuth";

describe("staff auth via Clerk / test session", () => {
  useTestServer({ ADMIN_2FA: "optional" });

  const prevAdmin = process.env.ADMIN_EMAILS;
  const prevSupport = process.env.SUPPORT_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "ops@example.com,admin@example.com";
    process.env.SUPPORT_EMAILS = "help@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = prevAdmin;
    process.env.SUPPORT_EMAILS = prevSupport;
  });

  it("treats ADMIN_EMAILS and SUPPORT_EMAILS as staff roles", () => {
    expect(staffEnabled()).toBe(true);
    expect(roleOf("ops@example.com")).toBe("admin");
    expect(roleOf("help@example.com")).toBe("support");
    expect(roleOf("kid@example.com")).toBeNull();
  });

  it("points the old login route at /signin/", async () => {
    const r = await startAdminSignIn(new Request("http://localhost/api/admin/login/", { method: "POST" }), "ops@example.com");
    const body = (await r.json()) as { redirect?: string };
    expect(body.redirect).toContain("/signin/");
    expect(ADMIN_COOKIE).toBe("ep_admin");
  });

  it("accepts a household test session for staff emails", async () => {
    const cookie = await cookieFor("admin@example.com");
    const req = new Request("http://localhost/api/admin/session/", { headers: { cookie, origin: "http://localhost" } });
    const session = await getStaffSession(req);
    expect(session?.email).toBe("admin@example.com");
    expect(session?.ready).toBe(true);
    expect(await getStaff(req)).toEqual({ email: "admin@example.com", role: "admin" });
  });

  it("refuses non-staff signed-in users", async () => {
    const cookie = await cookieFor("kid@example.com");
    const req = new Request("http://localhost/", { headers: { cookie, origin: "http://localhost" } });
    expect(await getStaffSession(req)).toBeNull();
  });
});
