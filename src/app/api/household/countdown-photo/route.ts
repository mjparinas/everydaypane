import { COUNTDOWN_PHOTO_SIDE, COUNTDOWN_SOURCE } from "@/server/countdownPhotos";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { addPhoto, blobConfigured, MAX_BYTES } from "@/server/library";
import { adminFor } from "@/server/viewer";

// Uploads one photo for a birthday, anniversary or other countdown date. The browser has already shrunk it to about
// 800 px JPEG; the widget's settings keep the returned id, and saving settings tidies away photos no date uses.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!blobConfigured()) return json({ error: "Photo storage isn't set up (BLOB_READ_WRITE_TOKEN)" }, 503);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return json({ error: "That picture is bigger than 4 MB" }, 413);
  const w = Number(req.headers.get("x-photo-width"));
  const h = Number(req.headers.get("x-photo-height"));
  if (!(w > 0 && h > 0 && w <= COUNTDOWN_PHOTO_SIDE && h <= COUNTDOWN_PHOTO_SIDE)) return json({ error: "Bad picture size" }, 400);
  const added = await addPhoto(session.accountId, COUNTDOWN_SOURCE, bytes, { w, h, origin: "upload" });
  return added.ok ? json({ id: added.photo.id }) : json({ error: added.reason }, 400);
}
