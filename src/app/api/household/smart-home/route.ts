import { z } from "zod";

import type { NativeSmartProvider } from "@/lib/smartHome";
import { ecobeeDevices } from "@/server/ecobee";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { nestDevices } from "@/server/nest";
import { setSecret } from "@/server/secrets";
import { disconnectSmartHome, smartConfigured, smartHomeConnected, SmartHomeDisconnected } from "@/server/smartHomeAuth";
import { smartThingsDevices } from "@/server/smartthings";
import { adminFor } from "@/server/viewer";

async function status(accountId: string, service: NativeSmartProvider) {
  const configured = smartConfigured(service);
  return { configured, connected: configured && (await smartHomeConnected(accountId, service)) };
}

const providers = ["nest", "ecobee", "smartthings"] as const;

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const pick = url.searchParams.get("provider");
  if (pick === "nest" || pick === "ecobee" || pick === "smartthings") {
    const base = await status(accountId, pick);
    let devices: { id: string; name: string }[] = [];
    let error = "";
    if (base.connected) {
      try {
        if (pick === "nest") devices = await nestDevices(accountId);
        else if (pick === "ecobee") devices = await ecobeeDevices(accountId);
        else devices = await smartThingsDevices(accountId);
      } catch (e) {
        if (e instanceof SmartHomeDisconnected) Object.assign(base, { connected: false, expired: true });
        else error = "Couldn't list devices. Try again in a minute.";
      }
    }
    return json({ ...base, devices, error });
  }
  const out: Record<string, Awaited<ReturnType<typeof status>>> = {};
  for (const p of providers) out[p] = await status(accountId, p);
  return json(out);
}

const putBody = z.object({
  tempestToken: z.string().min(8).max(80).nullable().optional(),
  wuApiKey: z.string().min(8).max(80).nullable().optional(),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 500).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const accountId = session.accountId;
  if (parsed.data.tempestToken !== undefined) await setSecret(accountId, "tempest.token", parsed.data.tempestToken);
  if (parsed.data.wuApiKey !== undefined) await setSecret(accountId, "wu.apiKey", parsed.data.wuApiKey);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const service = new URL(req.url).searchParams.get("provider");
  if (service !== "nest" && service !== "ecobee" && service !== "smartthings") return json({ error: "Bad request" }, 400);
  await disconnectSmartHome(session.accountId, service);
  return json({ ok: true });
}
