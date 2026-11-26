import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorKey } from "@/server/familyAuth";
import { featureOn } from "@/server/featureFlags";
import { json, notFound, sameOrigin, unauthorized } from "@/server/http";
import { whiteboardGet, whiteboardPost } from "@/server/whiteboardApi";

// The household's whiteboard from a phone (Melvin, 2026-11-26: "let the whiteboard sync from phones"): `/family/`
// with a family or admin session, or `/d/<token>/edit/` with the display token, like the message board.

export async function GET(req: Request) {
  if (!(await featureOn("widget.whiteboard"))) return notFound();
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  return whiteboardGet(req, familyEditorAccountId(editor));
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await featureOn("widget.whiteboard"))) return notFound();
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  // A doodle is many strokes, so the limit is generous; it only stops a runaway script.
  if (!(await rateLimit(`whiteboard:${familyEditorKey(editor)}`, 600, 60 * 60_000)))
    return json({ error: "That's a lot of drawing. Try again later." }, 429);
  return whiteboardPost(req, familyEditorAccountId(editor));
}
