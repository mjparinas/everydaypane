import { unauthorized } from "@/server/http";
import { newSlackState, SLACK_STATE_COOKIE, slackConfigured, slackConsentUrl, slackRedirect } from "@/server/slack";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!slackConfigured()) return new Response("Slack is not configured on the server.", { status: 503 });
  const url = new URL(req.url);
  const state = newSlackState();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${SLACK_STATE_COOKIE}=${state}; Path=/api/slack/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  return new Response(null, {
    status: 303,
    headers: { Location: slackConsentUrl(state, slackRedirect(url.origin)), "Set-Cookie": cookie, "Cache-Control": "no-store" },
  });
}
