import { z } from "zod";

import { pollDeviceSignIn } from "@/server/deviceSignIn";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({
  code: z.string().min(4).max(24),
  pollSecret: z.string().min(20).max(200),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ status: "expired" });
  return pollDeviceSignIn(req, parsed.data.code, parsed.data.pollSecret);
}
