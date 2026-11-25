import { readCookie } from "@/server/auth";
import { safeEqual } from "@/server/crypto";
import { unauthorized } from "@/server/http";
import { connectOura, OURA_STATE_COOKIE, ouraRedirect } from "@/server/oura";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const back = (r: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/household/?oura=${r}#settings/oura`,
        "Cache-Control": "no-store",
        "Set-Cookie": `${OURA_STATE_COOKIE}=; Path=/api/oura/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, OURA_STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectOura(session.accountId, code, ouraRedirect(url.origin));
  } catch {
    return back("failed");
  }
  return back("connected");
}
