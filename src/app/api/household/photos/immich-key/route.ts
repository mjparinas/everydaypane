import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { setSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

const body = z.object({ sourceId: z.string().min(1).max(64), apiKey: z.string().max(200).nullable() });

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 2000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  await setSecret(session.accountId, `immich.${parsed.data.sourceId}`, parsed.data.apiKey);
  return json({ ok: true });
}
