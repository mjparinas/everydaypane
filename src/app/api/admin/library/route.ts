import { loadConfig } from "@/server/config";
import { json, notFound, sameOrigin, unauthorized } from "@/server/http";
import { addPhoto, blobConfigured, listLibrary, MAX_BYTES, MAX_SIDE, removePhotos } from "@/server/library";
import { adminFor } from "@/server/viewer";

// The photo library's admin side: list, upload and remove photos of one "library" source. Uploads arrive already
// shrunk by the admin's browser (at most 2048 px, JPEG), one picture per request, under Vercel's 4.5 MB body limit.

async function librarySource(req: Request): Promise<string | null> {
  const id = new URL(req.url).searchParams.get("source") ?? "";
  const { config } = await loadConfig();
  return config.integrations.photos.sources.some((s) => s.id === id && s.kind === "library") ? id : null;
}

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const source = await librarySource(req);
  if (!source) return notFound();
  const photos = await listLibrary(source);
  return json({ storage: blobConfigured(), photos: photos.map(({ id, w, h, taken, origin }) => ({ id, w, h, taken, origin })) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const source = await librarySource(req);
  if (!source) return json({ error: "Save the album first, then upload to it." }, 404);
  if (!blobConfigured()) return json({ error: "Photo storage isn't set up (BLOB_READ_WRITE_TOKEN)" }, 503);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const w = Number(req.headers.get("x-photo-width"));
  const h = Number(req.headers.get("x-photo-height"));
  if (!(w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE)) return json({ error: "Bad picture size" }, 400);
  const added = await addPhoto(source, bytes, { w, h, taken: req.headers.get("x-photo-taken"), origin: "upload" });
  return added.ok ? json({ id: added.photo.id }) : json({ error: added.reason }, 400);
}

/** Removes one photo (?photo=) or every photo of the source. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await adminFor(req))) return unauthorized();
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(source)) return notFound();
  // A source being removed may already be gone from the saved settings, so this doesn't require it to exist.
  const removed = await removePhotos(source, url.searchParams.get("photo") ?? undefined);
  return json({ removed });
}
