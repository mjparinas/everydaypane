import { lockDisplayCookies } from "@/server/displayAuth";
import { json, sameOrigin } from "@/server/http";

/** Soft-lock the wall browser: clear `ep_wall` + `ep_display` so `/display/` shows the unlock gate again. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const res = json({ ok: true });
  for (const cookie of lockDisplayCookies()) res.headers.append("Set-Cookie", cookie);
  return res;
}
