import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { riversFeed } from "@/server/rivers";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const { config } = await loadDisplayConfig(accountIdOf(viewer));
  return json(await riversFeed(config));
}
