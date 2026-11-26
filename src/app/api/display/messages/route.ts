import { z } from "zod";

import { loadDisplayConfig } from "@/server/featureFlags";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { boardTag, forDisplay, listMessages, MESSAGE_COLOURS, postMessageFromWall } from "@/server/messages";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The board for the message board widget. Displays poll it; an unchanged board answers 304.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const messages = (await listMessages(accountId, 20)).map(forDisplay);
  const tag = boardTag(messages);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json({ messages }, 200, { etag: tag });
}

const postBody = z.object({
  author: z.string().trim().min(1).max(30),
  text: z.string().trim().min(1).max(280),
  colour: z.enum(MESSAGE_COLOURS),
});

/** Posts a note from the wall when a messages widget allows it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = postBody.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const config = (await loadDisplayConfig(accountId)).config;
  const by = viewer.kind === "device" ? `display:${viewer.device.id}` : "wall";
  const result = await postMessageFromWall(accountId, config, { ...parsed.data, postedBy: by });
  if (result === "forbidden") return json({ error: "Not allowed" }, 403);
  return json({ message: forDisplay(result) }, 201);
}
