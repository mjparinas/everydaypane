import { createReport } from "@/server/adminReports";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

/** Household Settings › Report a problem → platform admin Reports tab. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const body = (await readJson(req).catch(() => null)) as { text?: string } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return json({ error: "Say what happened." }, 400);
  const id = await createReport({ accountId: session.accountId, email: session.email, text });
  return json({ ok: true, id });
}
