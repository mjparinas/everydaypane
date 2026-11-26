import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorIsAdmin, familyEditorKey } from "@/server/familyAuth";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, notFound, sameOrigin, unauthorized } from "@/server/http";
import { addPhoto, blobConfigured, MAX_BYTES, MAX_SIDE, photoAddedBy, removePhotos } from "@/server/library";

// Family photos from phones (Melvin, 2026-11-26: photo frame polish, "family uploads from phones"): anyone on the
// Family page or the kitchen edit link adds pictures to a library album whose admin switched on "Family can add photos".
// Pictures arrive already shrunk by the phone (at most 2048 px JPEG), one per request. Someone can take back a photo
// they added; everything else about the album stays in Settings › Photos.

async function albums(accountId: string) {
  // Through the display copy of the settings, so a switched-off library source offers nothing here either.
  const { config } = await loadDisplayConfig(accountId);
  return config.integrations.photos.sources.flatMap((s) => (s.kind === "library" && s.familyUploads ? [{ id: s.id, name: s.name }] : []));
}

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  return json({ storage: blobConfigured(), albums: await albums(familyEditorAccountId(editor)) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const album = new URL(req.url).searchParams.get("album") ?? "";
  if (!(await albums(accountId)).some((a) => a.id === album)) return json({ error: "That album doesn't take photos from phones." }, 404);
  if (!blobConfigured()) return json({ error: "Photo storage isn't set up yet." }, 503);
  const actor = familyEditorKey(editor);
  if (!(await rateLimit(`family-photo:${actor}`, 100, 60 * 60_000)))
    return json({ error: "That's a lot of photos. Try again in an hour." }, 429);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const w = Number(req.headers.get("x-photo-width"));
  const h = Number(req.headers.get("x-photo-height"));
  if (!(w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE)) return json({ error: "Bad picture size" }, 400);
  const added = await addPhoto(accountId, album, bytes, {
    w,
    h,
    taken: req.headers.get("x-photo-taken"),
    origin: "upload",
    addedBy: actor,
  });
  return added.ok ? json({ id: added.photo.id }, 201) : json({ error: added.reason }, 400);
}

/** Takes back one photo this person added (an admin may take back any). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const url = new URL(req.url);
  const album = url.searchParams.get("album") ?? "";
  const photo = url.searchParams.get("photo") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(album) || !/^[A-Za-z0-9_-]{1,64}$/.test(photo)) return notFound();
  const by = await photoAddedBy(accountId, album, photo);
  if (by === undefined) return notFound();
  if (by !== familyEditorKey(editor) && !familyEditorIsAdmin(editor)) return json({ error: "Only who added it can take it back." }, 403);
  return json({ removed: await removePhotos(accountId, album, photo) });
}
