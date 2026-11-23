import { z } from "zod";

import { loadConfig } from "@/server/config";
import { photosGranted } from "@/server/google";
import { createSession, deleteSession, getSession, importPage, PhotosNotAllowed } from "@/server/googlePhotos";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { blobConfigured } from "@/server/library";
import { adminFor } from "@/server/viewer";

// Google Photos picking for the admin panel: GET says whether it's allowed (or, with ?session=, whether the photos
// are picked yet), POST starts a picker session or copies the next page of picked photos into a library album, and
// DELETE ends a session.

const fail = (error: unknown) =>
  error instanceof PhotosNotAllowed
    ? json({ error: error.message, connect: true }, 403)
    : json({ error: error instanceof Error ? error.message : "Google Photos didn't answer" }, 502);

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const id = new URL(req.url).searchParams.get("session");
  if (!id) return json({ allowed: await photosGranted(accountId), storage: blobConfigured() });
  try {
    const s = await getSession(accountId, id);
    return json({ ready: s.ready, pollMs: s.pollMs });
  } catch (error) {
    return fail(error);
  }
}

const body = z.union([
  z.object({ start: z.literal(true) }),
  z.object({ source: z.string().max(64), session: z.string().max(200), page: z.string().max(2000).nullable() }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req, 4000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  try {
    if ("start" in parsed.data) {
      const s = await createSession(accountId);
      return json({ session: s.id, pickerUri: s.pickerUri, pollMs: s.pollMs });
    }
    const { source, session, page } = parsed.data;
    const { config } = await loadConfig(accountId);
    if (!config.integrations.photos.sources.some((s) => s.id === source && s.kind === "library"))
      return json({ error: "Save the album first, then pick photos for it." }, 404);
    if (!blobConfigured()) return json({ error: "Photo storage isn't set up (BLOB_READ_WRITE_TOKEN)" }, 503);
    return json(await importPage(accountId, source, session, page));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const id = new URL(req.url).searchParams.get("session") ?? "";
  if (id) await deleteSession(accountId, id).catch(() => undefined);
  return json({ ok: true });
}
