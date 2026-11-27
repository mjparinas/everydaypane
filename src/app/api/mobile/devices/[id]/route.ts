import { z } from "zod";

import { requestSession } from "@/server/auth";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { mobileDevice, publicDevice, removeMobileDevice, updateMobilePrefs } from "@/server/mobile";

// One phone's settings in the app (This Phone card): what it gets notified about and whether it shares when it's
// home. Only the person who signed it in, or a household admin, may change or remove it.

type Ctx = { params: Promise<{ id: string }> };

async function own(req: Request, id: string) {
  const session = await requestSession(req);
  if (!session) return { error: unauthorized() } as const;
  const device = await mobileDevice(session.accountId, id);
  if (!device || (device.email !== session.email && session.role !== "admin")) return { error: notFound() } as const;
  return { session, device } as const;
}

export async function GET(req: Request, ctx: Ctx) {
  const found = await own(req, (await ctx.params).id);
  if ("error" in found) return found.error;
  return json({ device: publicDevice(found.device) });
}

const prefs = z.object({
  notifyMessages: z.boolean().optional(),
  notifyAlerts: z.boolean().optional(),
  sharePresence: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const found = await own(req, (await ctx.params).id);
  if ("error" in found) return found.error;
  const parsed = prefs.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const device = await updateMobilePrefs(found.session.accountId, found.device.id, parsed.data);
  return device ? json({ device: publicDevice(device) }) : notFound();
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const found = await own(req, (await ctx.params).id);
  if ("error" in found) return found.error;
  return json({ removed: await removeMobileDevice(found.session.accountId, found.device.id) });
}
