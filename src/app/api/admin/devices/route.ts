import { z } from "zod";

import { editPageUrl } from "@/lib/editPage";
import { addDevice, listDevices } from "@/server/devices";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { gateNewDisplay } from "@/server/planGates";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const origin = new URL(req.url).origin;
  // Always include each display's address so the Displays tab can show it with a Copy button (Melvin, 2026-11-22).
  const devices = (await listDevices(accountId)).map(({ token, ...d }) => ({
    ...d,
    url: token ? `${origin}/d/${token}/` : null,
    editUrl: token ? editPageUrl(origin, token) : null,
  }));
  return json({ devices });
}

const body = z.object({ name: z.string().trim().min(1).max(40), viewId: z.string().max(64).nullable() });

/** Adds a display and answers with its address (which the Displays tab can show again later). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Give the display a name" }, 400);
  const gate = await gateNewDisplay(accountId);
  if (!gate.ok) return json({ error: gate.error }, 402);
  const { device, token } = await addDevice(accountId, parsed.data.name, parsed.data.viewId);
  const origin = new URL(req.url).origin;
  return json({ device, url: `${origin}/d/${token}/`, editUrl: editPageUrl(origin, token) }, 201);
}