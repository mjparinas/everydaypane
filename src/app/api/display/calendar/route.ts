import { loadConfig } from "@/server/config";
import { calendarFeed, GoogleDisconnected } from "@/server/google";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const { config } = await loadConfig();
  try {
    const data = await calendarFeed(config);
    return json({ ...data.value, connected: true, stale: data.stale });
  } catch (error) {
    if (error instanceof GoogleDisconnected) return json({ updatedAt: Date.now(), from: "", to: "", events: [], connected: false });
    return json({ error: "The calendar is unavailable right now" }, 502);
  }
}
