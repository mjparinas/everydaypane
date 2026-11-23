import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";
import { appendStroke, clearWhiteboard, getWhiteboard, sanitizeStroke, whiteboardTag } from "@/server/whiteboard";

// The shared kitchen whiteboard. Displays poll it every few seconds; a stroke or a clear posts here.

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const body = await getWhiteboard();
  const tag = whiteboardTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const strokeBody = z.object({
  op: z.literal("stroke"),
  revision: z.number().int().min(0).max(1_000_000_000),
  stroke: z.unknown(),
});

const clearBody = z.object({
  op: z.literal("clear"),
  revision: z.number().int().min(0).max(1_000_000_000),
});

const body = z.discriminatedUnion("op", [strokeBody, clearBody]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  if (!(await viewerFor(req))) return unauthorized();
  const parsed = body.safeParse(await readJson(req, 40_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);

  if (parsed.data.op === "clear") {
    const result = await clearWhiteboard(parsed.data.revision);
    if (!result.ok) return json({ error: "stale", board: result.data }, 409);
    return json({ ok: true, board: result.data });
  }

  const stroke = sanitizeStroke(parsed.data.stroke);
  if (!stroke) return json({ error: "Bad stroke" }, 400);
  const result = await appendStroke(parsed.data.revision, stroke);
  if (!result.ok && result.reason === "stale") return json({ error: "stale", board: result.data }, 409);
  // A duplicate id (our own echo) is fine — the board already has it.
  return json({ ok: true, board: result.data });
}
