import { clearedSessionCookie, endSession, readCookie, SESSION_COOKIE } from "@/server/auth";
import { json, sameOrigin } from "@/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  await endSession(readCookie(req, SESSION_COOKIE));
  return json({ ok: true }, 200, { "Set-Cookie": clearedSessionCookie() });
}
