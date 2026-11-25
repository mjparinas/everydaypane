import { describe, expect, it, vi } from "vitest";

import { useTestServer } from "@/test/server";

import { createAccount } from "./accounts";
import { decodeTestSession, encodeTestSession, issueTestSession, requestSession, sessionFromEmail, testSessionCookie } from "./auth";

useTestServer();

describe("Clerk-backed household sessions (test cookie)", () => {
  it("issues a signed test session for seeded admins", async () => {
    const session = await issueTestSession("admin@example.com");
    expect(session?.role).toBe("admin");
    expect(session?.accountId).toBeTruthy();
    const cookie = testSessionCookie(session!);
    const value = cookie.split("=")[1]?.split(";")[0] ?? "";
    expect(decodeTestSession(value)?.email).toBe("admin@example.com");
  });

  it("re-reads membership on requestSession so family stays family", async () => {
    const session = await issueTestSession("kid@example.com");
    expect(session?.role).toBe("family");
    const header = testSessionCookie(session!).split(";")[0] ?? "";
    const resolved = await requestSession(new Request("http://localhost/", { headers: { cookie: header, origin: "http://localhost" } }));
    expect(resolved?.role).toBe("family");
  });

  it("rejects a tampered test cookie", () => {
    const session = { email: "admin@example.com", role: "admin" as const, accountId: "acct_x" };
    const token = encodeTestSession(session);
    const [payload] = token.split(".");
    expect(decodeTestSession(`${payload}.tampered`)).toBeNull();
  });

  it("creates a Free household on signup then issues a session", async () => {
    await createAccount("New home", "fresh@example.com");
    const session = await sessionFromEmail("fresh@example.com");
    expect(session?.role).toBe("admin");
    expect(session?.email).toBe("fresh@example.com");
  });

  it("returns null for strangers", async () => {
    expect(await issueTestSession("stranger@example.com")).toBeNull();
  });
});
