import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { getSecret, setSecret } from "@/server/secrets";
import { forgetUnifi, UnifiRefused, unifiSites, unifiSitesForKey } from "@/server/unifi";
import { adminFor } from "@/server/viewer";

// Settings › UniFi network: whether a Site Manager key is saved, and the sites it can see. The key itself never
// comes back to a browser (docs/unifi.md).

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const connected = Boolean(await getSecret(session.accountId, "unifi.apiKey"));
  if (!connected) return json({ connected, sites: [], error: "" });
  try {
    return json({ connected, sites: await unifiSites(session.accountId), error: "" });
  } catch (e) {
    return json({ connected, sites: [], error: e instanceof UnifiRefused ? e.message : "Couldn't reach UniFi. Try again in a minute." });
  }
}

const putBody = z.object({ apiKey: z.string().trim().min(16).max(200).nullable() });

/** Saves (after checking it with UniFi) or removes the Site Manager API key. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "That doesn't look like a UniFi API key." }, 400);
  const accountId = session.accountId;
  const apiKey = parsed.data.apiKey;
  if (apiKey === null) {
    await setSecret(accountId, "unifi.apiKey", null);
    await forgetUnifi(accountId);
    return json({ ok: true, sites: [] });
  }
  if ((await planForAccount(accountId)) !== "paid") return json({ error: "UniFi network needs Household." }, 402);
  let sites: { id: string; name: string }[];
  try {
    sites = await unifiSitesForKey(apiKey);
  } catch (e) {
    return json({ error: e instanceof UnifiRefused ? "UniFi refused that key." : "Couldn't reach UniFi to check the key." }, 400);
  }
  await setSecret(accountId, "unifi.apiKey", apiKey);
  await forgetUnifi(accountId);
  return json({ ok: true, sites });
}
