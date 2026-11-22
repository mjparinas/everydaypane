import { notifyNewStripAlerts } from "@/server/alertNotify";
import { alertsFeed } from "@/server/alerts";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const { config } = await loadConfig();
  const data = await alertsFeed(config);
  void notifyNewStripAlerts(config, data.alerts).catch((error) => console.error("[alerts] notify email failed", error));
  return json(data);
}
