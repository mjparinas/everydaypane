import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { tempestFeed } from "@/server/tempest";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadDisplayConfig(accountId);
  const data = await tempestFeed(accountId, config);
  return json({ ...data.value, stale: data.stale });
}
