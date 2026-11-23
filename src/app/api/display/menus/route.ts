import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { menusDashboardFeed } from "@/server/menus";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  const data = await menusDashboardFeed(accountId, config);
  return json({ ...data.value, stale: data.stale });
}
