import { readCookie } from "@/server/auth";
import { safeEqual } from "@/server/crypto";
import { connectFitbit, FITBIT_STATE_COOKIE, fitbitRedirect } from "@/server/fitbit";
import { unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const back = (r: string) =>
    new Response(null, { status: 303, headers: { Location: `/household/?fitbit=${r}#settings/content`, "Cache-Control": "no-store" } });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, FITBIT_STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectFitbit(session.accountId, code, fitbitRedirect(url.origin));
  } catch {
    return back("failed");
  }
  return back("connected");
}
