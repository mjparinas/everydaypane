import { json, unauthorized } from "@/server/http";
import { boardTag, forDisplay, listMessages } from "@/server/messages";
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
