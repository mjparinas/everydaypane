import { readCookie } from "@/server/auth";
import { safeEqual } from "@/server/crypto";
import { unauthorized } from "@/server/http";
import { connectSlack, SLACK_STATE_COOKIE, slackRedirect } from "@/server/slack";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const back = (r: string) =>
    new Response(null, { status: 303, headers: { Location: `/admin/?slack=${r}#settings/content`, "Cache-Control": "no-store" } });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, SLACK_STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectSlack(session.accountId, code, slackRedirect(url.origin));
  } catch {
    return back("failed");
  }
  return back("connected");
}
