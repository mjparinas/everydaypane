import { z } from "zod";

import { startSignUp } from "@/server/auth";
import { json, readJson, sameOrigin } from "@/server/http";

const body = z.object({
  email: z.email().max(254),
  name: z.string().trim().max(80).optional(),
  next: z.string().max(500).optional(),
});

/** Creates a Free household for a new email and sends a magic link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Enter an email address" }, 400);
  return startSignUp(req, parsed.data.email, parsed.data.name ?? "Home", new URL(req.url).origin, Date.now(), parsed.data.next);
}
