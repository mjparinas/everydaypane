import { z } from "zod";

import { finishSignIn, sessionCookie } from "@/server/auth";
import { clearedUnlockCookies } from "@/server/displayAuth";
import { readJson, sameOrigin } from "@/server/http";

const body = z.object({ token: z.string().min(20).max(100) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: "Not allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "That link isn't valid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const done = await finishSignIn(parsed.data.token);
  if (!done) {
    return Response.json(
      { error: "That link has expired or was already used. Ask for a new one." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Drop any prior wall unlock on this browser so the household preview cannot keep reading another account
  // through ep_display (Melvin, 2026-11-23: nothing shared across households).
  const res = new Response(JSON.stringify({ ok: true, role: done.session.role }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
  res.headers.append("Set-Cookie", sessionCookie(done.sessionToken));
  for (const c of clearedUnlockCookies()) res.headers.append("Set-Cookie", c);
  return res;
}
