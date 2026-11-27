import { z } from "zod";

import { rateLimit } from "@/server/db";
import { json, readJson, unauthorized } from "@/server/http";
import { deviceForRequest, setPresence } from "@/server/mobile";

// The app's home geofence says when this phone arrives or leaves (Melvin, 2026-11-27: groundwork for a phone-based
// "who's home"). Called by the native side with the app token, often in the background, so there is no Origin to
// check; the bearer token is the proof. Only kept while the person has "Share When I'm Home" on.

const body = z.object({ state: z.enum(["home", "away"]) });

export async function POST(req: Request) {
  const device = await deviceForRequest(req);
  if (!device) return unauthorized();
  if (!(await rateLimit(`mobile-presence:${device.id}`, 120, 60 * 60_000))) return json({ error: "Try again later" }, 429);
  const parsed = body.safeParse(await readJson(req, 200).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  return json({ saved: await setPresence(device, parsed.data.state) });
}
