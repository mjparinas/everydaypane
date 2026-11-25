import { z } from "zod";

import { ecoflowDevices, EcoFlowError, forgetEcoFlow } from "@/server/ecoflow";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { getSecret, setSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

// Settings › EcoFlow: whether keys are saved, the devices they can see, and saving or clearing the key pair.

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const connected = Boolean((await getSecret(accountId, "ecoflow.accessKey")) && (await getSecret(accountId, "ecoflow.secretKey")));
  if (!connected) return json({ connected, devices: [], error: "" });
  try {
    return json({ connected, devices: await ecoflowDevices(accountId), error: "" });
  } catch (e) {
    const error = e instanceof EcoFlowError ? e.message : "Couldn't reach EcoFlow. Try again in a minute.";
    return json({ connected, devices: [], error });
  }
}

const putBody = z.object({
  accessKey: z.string().trim().min(8).max(128),
  secretKey: z.string().trim().min(8).max(128),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  await setSecret(session.accountId, "ecoflow.accessKey", parsed.data.accessKey);
  await setSecret(session.accountId, "ecoflow.secretKey", parsed.data.secretKey);
  await forgetEcoFlow(session.accountId);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await setSecret(session.accountId, "ecoflow.accessKey", null);
  await setSecret(session.accountId, "ecoflow.secretKey", null);
  await forgetEcoFlow(session.accountId);
  return json({ ok: true });
}
