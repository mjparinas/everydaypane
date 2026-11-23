import { z } from "zod";

import { setChoresPin } from "@/server/chorePin";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

const body = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
});

/** Sets or clears the child PIN for the chore chart (hash only; config.chores.pinSet is saved with Settings). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 200).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setChoresPin(session.accountId, parsed.data.pin);
  if (result === "bad") return json({ error: "PIN must be four digits." }, 400);
  return json({ ok: true });
}
