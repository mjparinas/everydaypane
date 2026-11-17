import { beforeEach, vi } from "vitest";

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
