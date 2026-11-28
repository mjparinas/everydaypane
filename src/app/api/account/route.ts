import { z } from "zod";

import { deleteAccount, deletionPlan } from "@/server/accountDeletion";
import { authTestMode, clearedTestSessionCookie, clerkConfigured, requestSession } from "@/server/auth";
import { rateLimit } from "@/server/db";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";

// Delete Account from Settings or the Family page (Melvin, 2026-11-28, App Store guideline 5.1.1(v)). GET says what
// would go, DELETE does it once the person has typed DELETE, then removes their Clerk sign-in.

export async function GET(req: Request) {
  const session = await requestSession(req);
  if (!session) return unauthorized();
  return json({ email: session.email, plan: await deletionPlan(session.email) });
}

const body = z.object({ confirm: z.literal("DELETE") });

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`account-delete:${session.email}`, 5, 60 * 60_000))) return json({ error: "Try again later" }, 429);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Type DELETE to confirm" }, 400);

  const result = await deleteAccount(session.email);
  if (!result.ok)
    return result.error === "staff"
      ? json({ error: "This account is managed by Everydaypane. Email us from the Contact page to close it." }, 409)
      : json({ error: "Couldn't cancel the Household plan, so nothing was deleted. Try again in a minute." }, 502);

  if (clerkConfigured()) {
    try {
      const { auth, clerkClient } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) await (await clerkClient()).users.deleteUser(userId);
    } catch {
      // The Everydaypane data is already gone and the sign-in has no household left to open; staff can tidy Clerk.
    }
  }
  const headers: Record<string, string> = {};
  if (authTestMode()) headers["Set-Cookie"] = clearedTestSessionCookie();
  return json({ ok: true, deleted: result.plan.deleteHouseholds.length, left: result.plan.leaveHouseholds.length }, 200, headers);
}
