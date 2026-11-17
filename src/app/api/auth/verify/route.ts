import { z } from "zod";

import { finishSignIn, sessionCookie } from "@/server/auth";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({ token: z.string().min(20).max(100) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "That link isn't valid" }, 400);
  const done = await finishSignIn(parsed.data.token);
  if (!done) return json({ error: "That link has expired or was already used. Ask for a new one." }, 410);
  return json({ ok: true, role: done.session.role }, 200, { "Set-Cookie": sessionCookie(done.sessionToken) });
}
