import { z } from "zod";

import { createAccount } from "@/server/accounts";
import { authTestMode, issueTestSession, testSessionCookie } from "@/server/auth";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({
  email: z.email().max(254),
  name: z.string().max(80).optional(),
  intent: z.enum(["signin", "signup"]).optional(),
});

/**
 * CI / Playwright only (`AUTH_TEST_MODE=1`). Creates or looks up a Turso household and sets a signed test cookie.
 * Never enabled in production.
 */
export async function POST(req: Request) {
  if (!authTestMode()) return json({ error: "Not found" }, 404);
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Enter an email address" }, 400);
  const email = parsed.data.email.trim().toLowerCase();
  if (parsed.data.intent === "signup") {
    await createAccount(parsed.data.name || "Home", email);
  }
  const session = await issueTestSession(email);
  if (!session) return json({ error: "That address can't sign in." }, 403);
  const next = "/household/";
  return json({ ok: true, redirect: next }, 200, { "Set-Cookie": testSessionCookie(session) });
}
