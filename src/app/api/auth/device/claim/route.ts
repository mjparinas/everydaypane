import { z } from "zod";

import { claimDeviceSignIn } from "@/server/deviceSignIn";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({ handoff: z.string().min(20).max(200) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "That sign-in isn't valid." }, 400);
  return claimDeviceSignIn(req, parsed.data.handoff);
}
