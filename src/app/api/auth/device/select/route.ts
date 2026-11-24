import { z } from "zod";

import { requestSession } from "@/server/auth";
import { selectDisplayUnlock } from "@/server/deviceSignIn";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";

const body = z.object({ deviceId: z.string().trim().min(1).max(64) });

/** Signed-in wall browser picks a display without QR. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Pick which display this is." }, 400);
  return selectDisplayUnlock(req, session, parsed.data.deviceId);
}
