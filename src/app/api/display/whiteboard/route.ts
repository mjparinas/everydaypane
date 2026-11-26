import { json, sameOrigin, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { whiteboardGet, whiteboardPost } from "@/server/whiteboardApi";

// The household's whiteboard for the wall. Displays poll it every few seconds; a stroke or a clear posts here.

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return whiteboardGet(req, accountIdOf(viewer));
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return whiteboardPost(req, accountIdOf(viewer));
}
