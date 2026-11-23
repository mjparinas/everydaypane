import { json, unauthorized } from "@/server/http";
import { consentUrl, microsoftConfigured, newState, redirectUri, stateCookie } from "@/server/microsoft";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  if (!microsoftConfigured()) return json({ error: "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET aren't set" }, 503);
  const state = newState();
  const url = new URL(req.url);
  return new Response(null, {
    status: 303,
    headers: {
      Location: consentUrl(state, redirectUri(url.origin)),
      "Set-Cookie": stateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}
