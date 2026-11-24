import { z } from "zod";

import { requestSession } from "@/server/auth";
import { approveDeviceSignIn } from "@/server/deviceSignIn";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";

const body = z.object({
  code: z.string().min(4).max(24),
  deviceId: z.string().trim().min(1).max(64),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Pick which display this is, and check the code." }, 400);
  return approveDeviceSignIn(req, session, parsed.data.code, parsed.data.deviceId);
}
