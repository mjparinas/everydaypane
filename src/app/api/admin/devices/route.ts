import { z } from "zod";

import { addDevice, listDevices } from "@/server/devices";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  return json({ devices: await listDevices() });
}

const body = z.object({ name: z.string().trim().min(1).max(40), viewId: z.string().max(64).nullable() });

/** Adds a display and answers with its address (which the Displays tab can show again later). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Give the display a name" }, 400);
  const { device, token } = await addDevice(parsed.data.name, parsed.data.viewId);
  return json({ device, url: `${new URL(req.url).origin}/d/${token}/` }, 201);
}
