import { notifyNewStripAlerts } from "@/server/alertNotify";
import { alertsFeed } from "@/server/alerts";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  const data = await alertsFeed(config);
  void notifyNewStripAlerts(accountId, config, data.alerts).catch((error) => console.error("[alerts] notify email failed", error));
  return json(data);
}
