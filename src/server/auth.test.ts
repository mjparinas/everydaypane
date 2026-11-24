import { describe, expect, it, vi } from "vitest";

import { req, useTestServer } from "@/test/server";

import { accountsForEmail, LEGACY_ACCOUNT_ID } from "./accounts";
import { finishSignIn, LINK_MS, sessionFor, startSignIn, startSignUp } from "./auth";
import { loadConfig } from "./config";
import { query, run } from "./db";
import { gateConfig } from "./planGates";

async function linkFor(email: string, ip = "1.2.3.4"): Promise<string | null> {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  await startSignIn(req("/api/auth/start/", { method: "POST", ip }), email, "http://localhost");
  const printed = info.mock.calls.map((c) => String(c[0])).join("\n");
  info.mockRestore();
  return /token=([A-Za-z0-9_%-]+)/.exec(printed)?.[1] ?? null;
}

describe("magic link sign-in", () => {
  useTestServer();

  it("signs an admin in once per link", async () => {
    const token = await linkFor("Admin@Example.com");
    expect(token).not.toBeNull();
    const done = await finishSignIn(decodeURIComponent(token!));
    expect(done?.session).toEqual({ email: "admin@example.com", role: "admin", accountId: LEGACY_ACCOUNT_ID });
    expect(await sessionFor(done!.sessionToken)).toEqual({
      email: "admin@example.com",
      role: "admin",
      accountId: LEGACY_ACCOUNT_ID,
    });
    expect(await finishSignIn(decodeURIComponent(token!))).toBeNull();
  });

  it("gives family members the family role", async () => {
    const token = await linkFor("kid@example.com");
    expect((await finishSignIn(decodeURIComponent(token!)))?.session.role).toBe("family");
  });

  it("answers the same for an unknown address and sends nothing", async () => {
    const r = await startSignIn(req("/api/auth/start/", { method: "POST" }), "stranger@example.com", "http://localhost");
    expect(r.status).toBe(200);
    expect(await query("SELECT * FROM sign_in_links")).toHaveLength(0);
  });

  it("expires links after 15 minutes", async () => {
    const token = await linkFor("admin@example.com");
    expect(await finishSignIn(decodeURIComponent(token!), Date.now() + LINK_MS + 1)).toBeNull();
  });

  it("signs out someone removed from the household", async () => {
    const done = await finishSignIn(decodeURIComponent((await linkFor("admin@example.com"))!));
    await run("DELETE FROM account_members WHERE email = ?", ["admin@example.com"]);
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("FAMILY_EMAILS", "");
    expect(await sessionFor(done!.sessionToken)).toBeNull();
  });


  it("clears wall unlock cookies when the magic link is used", async () => {
    const { POST: verify } = await import("@/app/api/auth/verify/route");
    const { DISPLAY_COOKIE, WALL_COOKIE } = await import("./displayAuth");
    const token = await linkFor("admin@example.com");
    const r = await verify(
      req("/api/auth/verify/", {
        method: "POST",
        body: JSON.stringify({ token: decodeURIComponent(token!) }),
      }),
    );
    expect(r.status).toBe(200);
    const cookies = r.headers.getSetCookie?.() ?? [];
    expect(cookies.some((c) => c.startsWith("ep_session="))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${WALL_COOKIE}=`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${DISPLAY_COOKIE}=`) && c.includes("Max-Age=0"))).toBe(true);
  });

  it("limits tries per address", async () => {
    for (let i = 0; i < 10; i++) await startSignIn(req("/x", { ip: "9.9.9.9" }), `p${i}@example.com`, "http://localhost");
    const r = await startSignIn(req("/x", { ip: "9.9.9.9" }), "admin@example.com", "http://localhost");
    expect(r.status).toBe(429);
  });
});

describe("public Free signup", () => {
  useTestServer();

  it("creates a Free household and emails a link for a new address", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = await startSignUp(
      req("/api/auth/signup/", { method: "POST", ip: "5.5.5.5" }),
      "new.family@example.com",
      "Pat's home",
      "http://localhost",
    );
    expect(r.status).toBe(200);
    const members = await accountsForEmail("new.family@example.com");
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("admin");
    const printed = info.mock.calls.map((c) => String(c[0])).join("\n");
    info.mockRestore();
    expect(printed).toMatch(/token=/);
    expect(await query("SELECT * FROM sign_in_links")).toHaveLength(1);
    const { config } = await loadConfig(members[0]!.accountId);
    expect(config.views).toHaveLength(1);
    expect(gateConfig("free", config)).toEqual({ ok: true });
  });

  it("signs an existing member in without creating a second household", async () => {
    const before = await accountsForEmail("admin@example.com");
    const r = await startSignUp(
      req("/api/auth/signup/", { method: "POST", ip: "5.5.5.6" }),
      "admin@example.com",
      "Ignored",
      "http://localhost",
    );
    expect(r.status).toBe(200);
    expect(await accountsForEmail("admin@example.com")).toHaveLength(before.length);
  });

  it("creates only one household when two Free signups race", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const email = "race.family@example.com";
    await Promise.all([
      startSignUp(req("/api/auth/signup/", { method: "POST", ip: "7.7.7.1" }), email, "A", "http://localhost"),
      startSignUp(req("/api/auth/signup/", { method: "POST", ip: "7.7.7.2" }), email, "B", "http://localhost"),
    ]);
    info.mockRestore();
    const members = await accountsForEmail(email);
    expect(members).toHaveLength(1);
    expect(await query("SELECT * FROM signup_emails WHERE email = ?", [email])).toHaveLength(1);
  });
});
