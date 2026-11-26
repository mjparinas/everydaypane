import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { weatherUndergroundFeed } from "@/server/weatherUnderground";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadDisplayConfig(accountId);
  const data = await weatherUndergroundFeed(accountId, config);
  return json({ ...data.value, stale: data.stale });
}
