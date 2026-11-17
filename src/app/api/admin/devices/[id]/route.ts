import { z } from "zod";

import { removeDevice, updateDevice } from "@/server/devices";
import { json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

const patch = z.object({ name: z.string().trim().min(1).max(40).optional(), viewId: z.string().max(64).nullable().optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const parsed = patch.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const { id } = await ctx.params;
  const p: { name?: string; viewId?: string | null } = {};
  if (parsed.data.name !== undefined) p.name = parsed.data.name;
  if (parsed.data.viewId !== undefined) p.viewId = parsed.data.viewId;
  return (await updateDevice(id, p)) ? json({ ok: true }) : notFound();
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  return (await removeDevice((await ctx.params).id)) ? json({ ok: true }) : notFound();
}
