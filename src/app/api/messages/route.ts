import { z } from "zod";

import { rateLimit } from "@/server/db";
import { familyEditorFor, familyEditorIsAdmin, familyEditorKey } from "@/server/familyAuth";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { listMessages, MESSAGE_COLOURS, postMessage, type Message } from "@/server/messages";

// The family message board, for signed-in phones and `/d/<token>/edit/` (no pin from the kitchen link).

/** What a person sees: whether they may delete each note, but never who else's email posted it. */
const forPerson = (m: Message, actor: string, admin: boolean) => {
  const { postedBy, ...rest } = m;
  return { ...rest, mine: postedBy === actor, canDelete: admin || postedBy === actor };
};

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const actor = familyEditorKey(editor);
  const admin = familyEditorIsAdmin(editor);
  return json({ messages: (await listMessages(100)).map((m) => forPerson(m, actor, admin)), admin });
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
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const actor = familyEditorKey(editor);
  if (!(await rateLimit(`message:${actor}`, 30, 60 * 60_000))) return json({ error: "That's a lot of notes. Try again later." }, 429);
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const m = await postMessage({ ...parsed.data, postedBy: actor });
  return json({ message: forPerson(m, actor, familyEditorIsAdmin(editor)) }, 201);
}
