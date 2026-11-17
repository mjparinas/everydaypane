import { beforeEach, vi } from "vitest";

import { finishSignIn, sessionCookie, startSignIn } from "@/server/auth";
import { resetForTests } from "@/server/db";

/** A fresh in-memory database and test environment for each server test. */
export function useTestServer(envs: Record<string, string> = {}) {
  beforeEach(() => {
    resetForTests();
    vi.unstubAllEnvs();
    vi.stubEnv("SESSION_SECRET", "test-session-secret-0123456789abcdef0123");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("FAMILY_EMAILS", "kid@example.com");
    vi.stubEnv("RESEND_API_KEY", "");
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

/** A signed-in session's cookie header for an address on ADMIN_EMAILS or FAMILY_EMAILS, through the real magic link. */
export async function cookieFor(email: string): Promise<string> {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  await startSignIn(req("/api/auth/start/", { method: "POST" }), email, "http://localhost");
  const printed = info.mock.calls.map((c) => String(c[0])).join("\n");
  info.mockRestore();
  const token = /token=([A-Za-z0-9_%-]+)/.exec(printed)?.[1];
  const done = await finishSignIn(decodeURIComponent(token ?? ""));
  if (!done) throw new Error("Sign-in failed");
  return sessionCookie(done.sessionToken).split(";")[0] ?? "";
}
