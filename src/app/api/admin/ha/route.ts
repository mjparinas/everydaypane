import { z } from "zod";

import { loadConfig } from "@/server/config";
import { HaNotConfigured, listEntities, testConnection } from "@/server/homeassistant";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { secretsSet, setSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

// Home Assistant's connection for the admin panel. The token and the Cloudflare Access pair go to the server and are
// stored encrypted; the panel only learns which are set, whether the connection works, and the entity list.

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const set = await secretsSet();
  const status = { tokenSet: set["homeAssistant.token"], accessSet: set["homeAssistant.accessId"] && set["homeAssistant.accessSecret"] };
  const { config } = await loadConfig();
  if (!config.integrations.homeAssistant.url || !status.tokenSet) return json({ ...status, connected: false, entities: [] });
  try {
    const message = await testConnection(config);
    return json({ ...status, connected: true, message, entities: await listEntities(config) });
  } catch (error) {
    const message = error instanceof HaNotConfigured ? "Add the address and token" : error instanceof Error ? error.message : "No answer";
    return json({ ...status, connected: false, error: message, entities: [] });
  }
}

const secret = z.string().trim().min(1).max(4000).nullable().optional();
const body = z.object({ token: secret, accessId: secret, accessSecret: secret });

/** Saves secrets: a string sets one, null clears it, leaving it out keeps it. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 10_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const { token, accessId, accessSecret } = parsed.data;
  if (token !== undefined) await setSecret("homeAssistant.token", token);
  if (accessId !== undefined) await setSecret("homeAssistant.accessId", accessId);
  if (accessSecret !== undefined) await setSecret("homeAssistant.accessSecret", accessSecret);
  return json({ ok: true });
}
