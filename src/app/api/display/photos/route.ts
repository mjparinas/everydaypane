import { sha256 } from "@/server/crypto";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { photosFeed } from "@/server/photos";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The photo frame's lists. Displays ask every five minutes so a photo the family adds shows soon (photo frame polish,
// 2026-11-26); an unchanged list answers 304, so the poll costs a few bytes.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const body = await photosFeed(accountId, (await loadDisplayConfig(accountId)).config);
  const tag = `"photos-${sha256(JSON.stringify(body.sources)).slice(0, 22)}"`;
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}
