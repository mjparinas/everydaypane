import { z } from "zod";

import { removeFamilyEvent, updateFamilyEvent } from "@/server/familyEvents";
import { forbidden, json, notFound, readJson, sameOrigin, unauthorized } from "@/server/http";
import { requestSession } from "@/server/viewer";

const isoDate = z.iso.date();

const body = z
  .object({
    title: z.string().trim().min(1).max(120),
    allDay: z.boolean(),
    start: z.string().trim().min(1),
    end: z.string().trim().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.allDay) {
      if (!isoDate.safeParse(v.start).success) ctx.addIssue({ code: "custom", message: "Pick a start date", path: ["start"] });
      if (!isoDate.safeParse(v.end).success) ctx.addIssue({ code: "custom", message: "Pick an end date", path: ["end"] });
    }
  });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const result = await updateFamilyEvent(accountId, (await ctx.params).id, parsed.data, {
    email: session.email,
    admin: session.role === "admin",
  });
  if (result === "not-found") return notFound();
  if (result === "forbidden") return forbidden();
  if (result === "invalid") return json({ error: "End must be after start" }, 400);
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const result = await removeFamilyEvent(accountId, (await ctx.params).id, { email: session.email, admin: session.role === "admin" });
  if (result === "not-found") return notFound();
  if (result === "forbidden") return forbidden();
  return json({ ok: true });
}
