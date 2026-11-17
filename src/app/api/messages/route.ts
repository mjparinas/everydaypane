import { z } from "zod";

import { rateLimit } from "@/server/db";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { listMessages, MESSAGE_COLOURS, postMessage, type Message } from "@/server/messages";
import { requestSession } from "@/server/viewer";

// The family message board, for people signed in from their phones (admins and FAMILY_EMAILS).

/** What a person sees: whether they may delete each note, but never who else's email posted it. */
const forPerson = (m: Message, email: string, admin: boolean) => {
  const { postedBy, ...rest } = m;
  return { ...rest, mine: postedBy === email, canDelete: admin || postedBy === email };
};

export async function GET(req: Request) {
  const session = await requestSession(req);
  if (!session) return unauthorized();
  const admin = session.role === "admin";
  return json({ messages: (await listMessages(100)).map((m) => forPerson(m, session.email, admin)), admin });
}

const body = z.object({
  author: z.string().trim().min(1, "Say who it's from").max(30),
  text: z.string().trim().min(1, "Write a message").max(280),
  colour: z.enum(MESSAGE_COLOURS),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .nullable(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`message:${session.email}`, 30, 60 * 60_000)))
    return json({ error: "That's a lot of notes. Try again later." }, 429);
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const m = await postMessage({ ...parsed.data, postedBy: session.email });
  return json({ message: forPerson(m, session.email, session.role === "admin") }, 201);
}
