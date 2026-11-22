import { z } from "zod";

import { rateLimit } from "@/server/db";
import { createFamilyEvent, listFamilyEvents } from "@/server/familyEvents";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { requestSession } from "@/server/viewer";

// Family calendar events from phones (admins and FAMILY_EMAILS), merged into the display calendar feed.

const isoDate = z.iso.date();

const body = z
  .object({
    title: z.string().trim().min(1, "Add a title").max(120),
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

const forPerson = (e: Awaited<ReturnType<typeof listFamilyEvents>>[number], email: string, admin: boolean) => {
  const { createdBy, ...rest } = e;
  return { ...rest, mine: createdBy === email, canDelete: admin || createdBy === email };
};

export async function GET(req: Request) {
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const admin = session.role === "admin";
  return json({ events: (await listFamilyEvents()).map((e) => forPerson(e, session.email, admin)) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`family-event:${session.email}`, 60, 60 * 60_000)))
    return json({ error: "That's a lot of events. Try again later." }, 429);
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const created = await createFamilyEvent({ ...parsed.data, createdBy: session.email });
  if (created === "invalid") return json({ error: "End must be after start" }, 400);
  return json({ event: forPerson(created, session.email, session.role === "admin") }, 201);
}
