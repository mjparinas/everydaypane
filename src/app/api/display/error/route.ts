import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { rateLimit } from "@/server/db";
import { clientIp, json, readJson } from "@/server/http";
import { viewerFor } from "@/server/viewer";

// The display reports its errors here instead of loading Sentry (AGENTS.md "Monitoring"), and the server passes them on.
const body = z.object({ message: z.string().max(500), stack: z.string().max(4000).optional(), where: z.string().max(100).optional() });

export async function POST(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return json({ ok: false }, 401);
  if (!(await rateLimit(`display-error:${clientIp(req)}`, 20, 60 * 60_000))) return json({ ok: false }, 429);
  const parsed = body.safeParse(await readJson(req, 8_000).catch(() => null));
  if (!parsed.success) return json({ ok: false }, 400);
  const error = new Error(parsed.data.message);
  if (parsed.data.stack) error.stack = parsed.data.stack;
  Sentry.captureException(error, { tags: { surface: "display", where: parsed.data.where ?? "" } });
  console.error("[display]", parsed.data.message);
  return json({ ok: true });
}
