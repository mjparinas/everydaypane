import { combinedFeed } from "@/server/calendars";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const { config } = await loadConfig();
  try {
    const feed = await combinedFeed(config);
    if (!feed.connected) return json({ ...feed.data, updatedAt: Date.now(), connected: false });
    return json({ ...feed.data, connected: true, stale: feed.stale });
  } catch {
    return json({ error: "The calendar is unavailable right now" }, 502);
  }
}
