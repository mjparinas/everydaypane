import { disconnect, googleConfigured, GoogleDisconnected, listCalendars } from "@/server/google";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { secretsSet } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

/** Whether Google is connected, and the account's calendars for the admin panel's picker. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const configured = googleConfigured();
  const connected = (await secretsSet())["google.refreshToken"];
  if (!configured || !connected) return json({ configured, connected: false, calendars: [] });
  try {
    return json({ configured, connected: true, calendars: await listCalendars() });
  } catch (error) {
    if (error instanceof GoogleDisconnected) return json({ configured, connected: false, calendars: [], expired: true });
    return json({ configured, connected: true, calendars: [], error: "Google Calendar didn't answer. Try again in a minute." });
  }
}

/** Disconnects Google: forgets the token here and revokes it at Google. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  await disconnect();
  return json({ ok: true });
}
