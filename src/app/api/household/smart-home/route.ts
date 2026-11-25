import { z } from "zod";

import type { NativeSmartProvider } from "@/lib/smartHome";
import { ecobeeDevices } from "@/server/ecobee";
import { forgetGovee, goveeCheckKey, goveeDevices, GoveeKeyRefused } from "@/server/govee";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { nestDevices } from "@/server/nest";
import { getSecret, setSecret } from "@/server/secrets";
import { disconnectSmartHome, smartConfigured, smartHomeConnected, SmartHomeDisconnected } from "@/server/smartHomeAuth";
import { smartThingsDevices } from "@/server/smartthings";
import { adminFor } from "@/server/viewer";

async function status(accountId: string, service: NativeSmartProvider) {
  const configured = smartConfigured(service);
  return { configured, connected: configured && (await smartHomeConnected(accountId, service)) };
}

const providers = ["nest", "ecobee", "smartthings"] as const;

// Govee signs in with an API key from the Govee Home app, not OAuth, so it is always "configured".
async function goveeStatus(accountId: string) {
  return { configured: true, connected: Boolean(await getSecret(accountId, "govee.apiKey")) };
}

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const pick = url.searchParams.get("provider");
  if (pick === "govee") {
    const base: { configured: boolean; connected: boolean; expired?: boolean } = await goveeStatus(accountId);
    let devices: { id: string; name: string; sku?: string }[] = [];
    let error = "";
    if (base.connected) {
      try {
        devices = (await goveeDevices(accountId)).map((d) => ({ id: d.id, name: d.name, sku: d.sku }));
      } catch (e) {
        if (e instanceof GoveeKeyRefused) Object.assign(base, { connected: false, expired: true });
        else error = "Couldn't list Govee devices. Try again in a minute.";
      }
    }
    return json({ ...base, devices, error });
  }
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
  return json({ ...out, govee: await goveeStatus(accountId) });
}

const putBody = z.object({
  tempestToken: z.string().min(8).max(80).nullable().optional(),
  wuApiKey: z.string().min(8).max(80).nullable().optional(),
  goveeApiKey: z.string().trim().min(8).max(80).optional(),
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
  if (parsed.data.goveeApiKey !== undefined) {
    // Checked with Govee before it is kept, so a typo says so here rather than as blank tiles on the wall.
    let devices: number;
    try {
      devices = await goveeCheckKey(parsed.data.goveeApiKey);
    } catch (e) {
      return json(
        { error: e instanceof GoveeKeyRefused ? "Govee didn't accept that key." : "Couldn't reach Govee. Try again in a minute." },
        400,
      );
    }
    await setSecret(accountId, "govee.apiKey", parsed.data.goveeApiKey);
    await forgetGovee(accountId);
    return json({ ok: true, devices });
  }
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const service = new URL(req.url).searchParams.get("provider");
  if (service === "govee") {
    await setSecret(session.accountId, "govee.apiKey", null);
    await forgetGovee(session.accountId);
    return json({ ok: true });
  }
  if (service !== "nest" && service !== "ecobee" && service !== "smartthings") return json({ error: "Bad request" }, 400);
  await disconnectSmartHome(session.accountId, service);
  return json({ ok: true });
}
