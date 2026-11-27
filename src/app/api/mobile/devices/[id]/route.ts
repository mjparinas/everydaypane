import { z } from "zod";

import { requestSession, type Session } from "@/server/auth";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { mobileDevice, publicDevice, removeMobileDevice, updateMobilePrefs, type MobileDevice } from "@/server/mobile";

// One phone's settings in the app (This Phone card): what it gets notified about and whether it shares when it's
// home. Only the person who signed it in, or a household admin, may change or remove it.

type Ctx = { params: Promise<{ id: string }> };

type Owned = { ok: true; session: Session; device: MobileDevice } | { ok: false; error: Response };

async function own(req: Request, id: string): Promise<Owned> {
  const session = await requestSession(req);
  if (!session) return { ok: false, error: unauthorized() };
  const device = await mobileDevice(session.accountId, id);
  if (!device || (device.email !== session.email && session.role !== "admin")) return { ok: false, error: notFound() };
  return { ok: true, session, device };
}

export async function GET(req: Request, ctx: Ctx) {
  const found = await own(req, (await ctx.params).id);
  if (!found.ok) return found.error;
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
  if (!found.ok) return found.error;
  const parsed = prefs.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const device = await updateMobilePrefs(found.session.accountId, found.device.id, parsed.data);
  return device ? json({ device: publicDevice(device) }) : notFound();
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const found = await own(req, (await ctx.params).id);
  if (!found.ok) return found.error;
  return json({ removed: await removeMobileDevice(found.session.accountId, found.device.id) });
}
