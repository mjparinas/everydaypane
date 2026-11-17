import { z } from "zod";

import { loadConfig, saveConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  return json(await loadConfig());
}

const body = z.object({ baseVersion: z.number().int().min(0), config: z.unknown() });

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await saveConfig(parsed.data.config, parsed.data.baseVersion);
  return result.ok ? json(result) : json(result, result.status);
}
