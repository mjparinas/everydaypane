import { combinedFeed } from "@/server/calendars";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  try {
    const feed = await combinedFeed(accountId, config);
    if (!feed.connected) return json({ ...feed.data, updatedAt: Date.now(), connected: false });
    return json({ ...feed.data, connected: true, stale: feed.stale });
  } catch {
    return json({ error: "The calendar is unavailable right now" }, 502);
  }
}
