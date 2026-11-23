import { z } from "zod";

import { configSchema } from "@/lib/config/schema";
import { loadConfig, saveConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { gateConfig, planForAccount } from "@/server/planGates";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  return json(await loadConfig(accountId));
}

const body = z.object({ baseVersion: z.number().int().min(0), config: z.unknown() });

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const cfg = configSchema.safeParse(parsed.data.config);
  if (cfg.success) {
    const gate = gateConfig(await planForAccount(accountId), cfg.data);
    if (!gate.ok) return json({ error: gate.error }, 402);
  }
  const result = await saveConfig(accountId, parsed.data.config, parsed.data.baseVersion);
  return result.ok ? json(result) : json(result, result.status);
}
