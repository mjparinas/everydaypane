import { FITBIT_STATE_COOKIE, fitbitConfigured, fitbitConsentUrl, fitbitRedirect, newFitbitState } from "@/server/fitbit";
import { unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!fitbitConfigured()) return new Response("Fitbit is not configured on the server.", { status: 503 });
  const url = new URL(req.url);
  const state = newFitbitState();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${FITBIT_STATE_COOKIE}=${state}; Path=/api/fitbit/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  return new Response(null, {
    status: 303,
    headers: { Location: fitbitConsentUrl(state, fitbitRedirect(url.origin)), "Set-Cookie": cookie, "Cache-Control": "no-store" },
  });
}
