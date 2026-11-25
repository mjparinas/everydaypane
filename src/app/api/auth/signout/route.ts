import { auth, clerkClient } from "@clerk/nextjs/server";

import { authTestMode, clearedTestSessionCookie, clerkConfigured } from "@/server/auth";
import { json, sameOrigin } from "@/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);

  if (clerkConfigured()) {
    try {
      const { sessionId } = await auth();
      if (sessionId) {
        const client = await clerkClient();
        await client.sessions.revokeSession(sessionId);
      }
    } catch {
      // Client-side Clerk signOut is the primary path; this is best-effort.
    }
  }

  const headers: Record<string, string> = {};
  if (authTestMode()) headers["Set-Cookie"] = clearedTestSessionCookie();
  return json({ ok: true }, 200, headers);
}
