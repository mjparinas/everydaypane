import { json, sameOrigin, unauthorized } from "@/server/http";
import { disconnectOura, ouraConfigured, ouraConnected } from "@/server/oura";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const configured = ouraConfigured();
  return json({ configured, connected: configured && (await ouraConnected(session.accountId)) });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await disconnectOura(session.accountId);
  return json({ ok: true });
}
