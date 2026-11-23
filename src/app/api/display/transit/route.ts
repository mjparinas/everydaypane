import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { transitFeed } from "@/server/translink";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Reading TransLink's static timetable for names, every few days, can take a few seconds.
export const maxDuration = 60;

/** The next departures from every stop a transit widget shows. Displays poll it every 30 seconds. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    const data = await transitFeed((await loadConfig(accountId)).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "TransLink's live departures are unavailable right now" }, 502);
  }
}
