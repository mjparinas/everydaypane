import { consentUrl, googleConfigured, newState, redirectUri, stateCookie } from "@/server/google";
import { json, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

// Starts connecting Google Calendar: sends the admin to Google's consent screen with a one-time state value that the
// callback checks, so nobody can trick an admin's browser into connecting someone else's account.
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  if (!googleConfigured()) return json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET aren't set" }, 503);
  const state = newState();
  const origin = new URL(req.url).origin;
  return new Response(null, {
    status: 303,
    headers: { Location: consentUrl(state, redirectUri(origin)), "Set-Cookie": stateCookie(state), "Cache-Control": "no-store" },
  });
}
