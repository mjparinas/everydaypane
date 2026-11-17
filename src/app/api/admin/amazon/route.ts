import { z } from "zod";

import { forget } from "@/server/cache";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { amazonPeople } from "@/server/photos";
import { getSecret, secretsSet, setSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

// Amazon sign-in for "photos of people": the admin pastes the cookies from a signed-in amazon.ca tab. They are stored
// encrypted and never sent back; the panel only learns whether they're set and which people Amazon lists.

/** Whether Amazon is signed in, and its people (face groups) for the picker. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const set = (await secretsSet())["amazon.cookie"];
  if (!set) return json({ connected: false, people: [], tld: (await getSecret("amazon.tld")) ?? "ca" });
  try {
    return json({ connected: true, people: await amazonPeople(), tld: (await getSecret("amazon.tld")) ?? "ca" });
  } catch (error) {
    return json({ connected: true, people: [], error: error instanceof Error ? error.message : "Amazon didn't answer" });
  }
}

const body = z.object({
  cookie: z.string().trim().max(8000).nullable(),
  tld: z.enum(["ca", "com"]).default("ca"),
});

/** Saves (or with cookie: null, forgets) the Amazon cookies. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const { cookie, tld } = parsed.data;
  if (cookie && !/session-id=/.test(cookie)) return json({ error: "That doesn't look like Amazon's cookies (no session-id)." }, 422);
  await setSecret("amazon.cookie", cookie || null);
  await setSecret("amazon.tld", cookie ? tld : null);
  await forget("photos:");
  return json({ ok: true });
}
