import { json, sameOrigin, unauthorized } from "@/server/http";
import { disconnect, listCalendars, microsoftConfigured, MicrosoftDisconnected } from "@/server/microsoft";
import { secretsSet } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const configured = microsoftConfigured();
  const connected = Boolean((await secretsSet(accountId))["microsoft.refreshToken"]);
  if (!configured || !connected) return json({ configured, connected: false, calendars: [] });
  try {
    return json({ configured, connected: true, calendars: await listCalendars(accountId) });
  } catch (error) {
    if (error instanceof MicrosoftDisconnected) return json({ configured, connected: false, calendars: [], expired: true });
    return json({ configured, connected: true, calendars: [], error: "Microsoft 365 didn't answer. Try again in a minute." });
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await disconnect(session.accountId);
  return json({ ok: true });
}
