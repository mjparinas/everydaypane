import { beforeEach, vi } from "vitest";

import { resetAccountsForTests } from "@/server/accounts";
import { issueTestSession, testSessionCookie } from "@/server/auth";
import { resetForTests } from "@/server/db";

/** A fresh in-memory database and test environment for each server test. */
export function useTestServer(envs: Record<string, string> = {}) {
  beforeEach(() => {
    resetForTests();
    resetAccountsForTests();
    vi.unstubAllEnvs();
    vi.stubEnv("SESSION_SECRET", "test-session-secret-0123456789abcdef0123");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("FAMILY_EMAILS", "kid@example.com");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AUTH_TEST_MODE", "1");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    for (const [k, v] of Object.entries(envs)) vi.stubEnv(k, v);
  });
}

export const req = (url: string, init: RequestInit & { ip?: string } = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: {
      origin: "http://localhost",
      "x-forwarded-for": init.ip ?? "1.2.3.4",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** A signed-in test session cookie header for an address on ADMIN_EMAILS or FAMILY_EMAILS. */
export async function cookieFor(email: string): Promise<string> {
  const session = await issueTestSession(email);
  if (!session) throw new Error("Sign-in failed");
  return testSessionCookie(session).split(";")[0] ?? "";
}
