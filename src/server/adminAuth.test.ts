import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cookieFor, useTestServer } from "@/test/server";

import { getStaff, getStaffSession, roleOf, staffEnabled } from "./adminAuth";

describe("staff auth via Clerk / test session", () => {
  useTestServer();

  const prevAdmin = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "ops@example.com,admin@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = prevAdmin;
  });

  it("treats ADMIN_EMAILS as staff", () => {
    expect(staffEnabled()).toBe(true);
    expect(roleOf("ops@example.com")).toBe("admin");
    expect(roleOf("help@example.com")).toBeNull();
    expect(roleOf("kid@example.com")).toBeNull();
  });

  it("accepts a household test session for staff emails", async () => {
    const cookie = await cookieFor("admin@example.com");
    const req = new Request("http://localhost/api/admin/session/", { headers: { cookie, origin: "http://localhost" } });
    const session = await getStaffSession(req);
    expect(session?.email).toBe("admin@example.com");
    expect(session?.role).toBe("admin");
    expect(await getStaff(req)).toEqual({ email: "admin@example.com", role: "admin" });
  });

  it("refuses non-staff signed-in users", async () => {
    const cookie = await cookieFor("kid@example.com");
    const req = new Request("http://localhost/", { headers: { cookie, origin: "http://localhost" } });
    expect(await getStaffSession(req)).toBeNull();
  });
});
