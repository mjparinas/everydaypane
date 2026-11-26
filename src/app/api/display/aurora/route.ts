import { auroraFeed } from "@/server/aurora";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Tonight's aurora outlook at the dashboard's location, polled every 30 minutes.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const { location } = (await loadDisplayConfig(accountIdOf(viewer))).config;
  return json(await auroraFeed(location));
}
