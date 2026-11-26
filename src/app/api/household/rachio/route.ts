import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { checkRachioKey, rachioControllers, RachioRefused, saveRachioKey } from "@/server/rachio";
import { adminFor } from "@/server/viewer";

// Settings › Sprinklers: whether a Rachio API key is saved, and its controllers for the widget's picker. The key goes
// in only; nothing here ever sends it back.

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  try {
    const controllers = await rachioControllers(session.accountId);
    return json({ configured: controllers !== null, controllers: controllers ?? [], error: "" });
  } catch (e) {
    return json({
      configured: true,
      controllers: [],
      error:
        e instanceof RachioRefused ? "Rachio refused the saved API key. Paste it again." : "Couldn't reach Rachio. Try again in a minute.",
    });
  }
}

const putBody = z.object({ apiKey: z.string().trim().min(16).max(100) });

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Paste the API key from the Rachio app." }, 400);
  let controllers;
  try {
    controllers = await checkRachioKey(parsed.data.apiKey);
  } catch (e) {
    if (e instanceof RachioRefused) return json({ error: "Rachio didn't accept that API key." }, 400);
    return json({ error: "Couldn't reach Rachio to check it. Try again in a minute." }, 502);
  }
  await saveRachioKey(session.accountId, parsed.data.apiKey);
  return json({ configured: true, controllers, error: "" });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await saveRachioKey(session.accountId, null);
  return json({ configured: false, controllers: [], error: "" });
}
