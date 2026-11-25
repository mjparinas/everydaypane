/** Edge-safe auth flags (used from proxy.ts). Keep free of `server-only` and Node APIs. */

export const TEST_SESSION_COOKIE = "ep_test_session";

export function clerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.startsWith("sk_") && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_"));
}

export function authTestMode(): boolean {
  return process.env.AUTH_TEST_MODE === "1" || process.env.VITEST === "true" || Boolean(process.env.VITEST);
}
