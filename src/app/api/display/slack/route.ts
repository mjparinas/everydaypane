import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { slackFeed } from "@/server/slack";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const url = new URL(req.url);
  const accountId = accountIdOf(viewer);
  const count = Math.min(15, Math.max(1, Number(url.searchParams.get("count") ?? "8")));
  try {
    return json(await slackFeed(accountId, (await loadConfig(accountId)).config, count));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, unreadMentions: 0, lines: [] });
  }
}
