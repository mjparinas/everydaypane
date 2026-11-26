import { z } from "zod";

import { loadConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { checkLgToken, laundryMachines, laundrySources, LgRefused, saveLgToken } from "@/server/laundry";
import { adminFor } from "@/server/viewer";

// Settings › Laundry: which sources are connected and the machines they list (for the widget's picker). The LG token
// goes in only; nothing here ever sends it back.

async function status(accountId: string) {
  const sources = await laundrySources(accountId);
  if (!sources.lg && !sources.smartthings) return { ...sources, machines: [], error: "" };
  const { config } = await loadConfig(accountId);
  try {
    return { ...sources, machines: await laundryMachines(accountId, config), error: "" };
  } catch {
    return { ...sources, machines: [], error: "Couldn't list the machines. Try again in a minute." };
  }
}

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  return json(await status(session.accountId));
}

const putBody = z.object({
  token: z.string().trim().min(16).max(400),
  country: z.string().regex(/^[A-Z]{2}$/),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Paste the whole personal access token." }, 400);
  try {
    await checkLgToken(session.accountId, parsed.data.token, parsed.data.country);
  } catch (e) {
    if (e instanceof LgRefused) return json({ error: "LG didn't accept that token. Check it and the country." }, 400);
    return json({ error: "Couldn't reach LG ThinQ to check it. Try again in a minute." }, 502);
  }
  await saveLgToken(session.accountId, parsed.data.token);
  return json(await status(session.accountId));
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await saveLgToken(session.accountId, null);
  return json(await status(session.accountId));
}
