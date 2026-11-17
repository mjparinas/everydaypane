import { z } from "zod";

import { startSignIn } from "@/server/auth";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({ email: z.email().max(254) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Enter an email address" }, 400);
  return startSignIn(req, parsed.data.email, new URL(req.url).origin);
}
