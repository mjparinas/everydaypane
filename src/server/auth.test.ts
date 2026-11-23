import { describe, expect, it, vi } from "vitest";

import { req, useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { finishSignIn, LINK_MS, sessionFor, startSignIn } from "./auth";
import { query, run } from "./db";

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

  it("limits tries per address", async () => {
    for (let i = 0; i < 10; i++) await startSignIn(req("/x", { ip: "9.9.9.9" }), `p${i}@example.com`, "http://localhost");
    const r = await startSignIn(req("/x", { ip: "9.9.9.9" }), "admin@example.com", "http://localhost");
    expect(r.status).toBe(429);
  });
});
