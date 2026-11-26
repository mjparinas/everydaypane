import "server-only";

import { z } from "zod";

import { json, readJson } from "./http";
import { appendStroke, clearWhiteboard, getWhiteboard, sanitizeStroke, whiteboardTag } from "./whiteboard";

// The board's GET and POST, shared by the wall (`/api/display/whiteboard/`) and phones (`/api/whiteboard/`), so a
// stroke from either lands the same way. Callers check who is asking and pass that household's id.

export async function whiteboardGet(req: Request, accountId: string): Promise<Response> {
  const body = await getWhiteboard(accountId);
  const tag = whiteboardTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const revision = z.number().int().min(0).max(1_000_000_000);
const body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("stroke"), revision, stroke: z.unknown() }),
  z.object({ op: z.literal("clear"), revision }),
]);

export async function whiteboardPost(req: Request, accountId: string): Promise<Response> {
  const parsed = body.safeParse(await readJson(req, 40_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);

  if (parsed.data.op === "clear") {
    const result = await clearWhiteboard(accountId, parsed.data.revision);
    if (!result.ok) return json({ error: "stale", board: result.data }, 409);
    return json({ ok: true, board: result.data });
  }

  const stroke = sanitizeStroke(parsed.data.stroke);
  if (!stroke) return json({ error: "Bad stroke" }, 400);
  const result = await appendStroke(accountId, parsed.data.revision, stroke);
  if (!result.ok && result.reason === "stale") return json({ error: "stale", board: result.data }, 409);
  // A duplicate id (our own echo) is fine — the board already has it.
  return json({ ok: true, board: result.data });
}
