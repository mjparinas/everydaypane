import { sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";
import { saveYnabToken } from "@/server/ynab";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (token.length < 8) return new Response("Token too short", { status: 400 });
  await saveYnabToken(session.accountId, token);
  return new Response(null, { status: 204 });
}
