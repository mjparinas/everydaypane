import { blueRiiotFeed } from "@/server/blueRiiot";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadDisplayConfig(accountId);
  return json(await blueRiiotFeed(accountId, config));
}
