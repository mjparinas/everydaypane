import { z } from "zod";

import { editPageUrl } from "@/lib/editPage";
import { DISPLAY_PATH } from "@/lib/site";
import { deviceToken, newDeviceToken, removeDevice, updateDevice } from "@/server/devices";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

const patch = z.object({ name: z.string().trim().min(1).max(40).optional(), viewId: z.string().max(64).nullable().optional() });

const linksFor = (req: Request, token: string) => {
  const origin = new URL(req.url).origin;
  return { url: `${origin}${DISPLAY_PATH}`, editUrl: editPageUrl(origin, token) };
};

/** The display's address, for the signed-in admin to see or copy again. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const token = await deviceToken(accountId, (await ctx.params).id);
  return token ? json(linksFor(req, token)) : notFound();
}

/** Gives the display a new address; the old one stops working straight away. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const token = await newDeviceToken(accountId, (await ctx.params).id);
  return token ? json(linksFor(req, token)) : notFound();
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = patch.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const { id } = await ctx.params;
  const p: { name?: string; viewId?: string | null } = {};
  if (parsed.data.name !== undefined) p.name = parsed.data.name;
  if (parsed.data.viewId !== undefined) p.viewId = parsed.data.viewId;
  return (await updateDevice(accountId, id, p)) ? json({ ok: true }) : notFound();
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  return (await removeDevice(accountId, (await ctx.params).id)) ? json({ ok: true }) : notFound();
}
