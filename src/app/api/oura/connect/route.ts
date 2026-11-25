import { unauthorized } from "@/server/http";
import { newOuraState, ouraConfigured, ouraConsentUrl, ouraRedirect, ouraStateCookie } from "@/server/oura";
import { adminFor } from "@/server/viewer";

// Sends a household admin to Oura's sign-in page. The state cookie ties the answer to this browser.
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!ouraConfigured()) return new Response("Oura is not configured on the server.", { status: 503 });
  const url = new URL(req.url);
  const state = newOuraState();
  return new Response(null, {
    status: 303,
    headers: {
      Location: ouraConsentUrl(state, ouraRedirect(url.origin)),
      "Set-Cookie": ouraStateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}
