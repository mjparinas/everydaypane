import { loadConfig } from "@/server/config";
import { ecoflowFeed } from "@/server/ecoflow";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  return json(await ecoflowFeed(accountId, config));
}
