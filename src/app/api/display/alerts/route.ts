import { rank } from "@/lib/alerts";
import { indoorAlertsFor } from "@/server/airthings";
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
  // High radon and CO₂ from Airthings join the area's alerts when switched on (Settings › Indoor air); one failing
  // never hides the other.
  const [area, indoor] = await Promise.all([alertsFeed(config), indoorAlertsFor(accountId, config).catch(() => [])]);
  const data = indoor.length
    ? { ...area, alerts: [...area.alerts, ...indoor].sort((a, b) => rank(a.severity) - rank(b.severity) || b.sent - a.sent) }
    : area;
  void notifyNewStripAlerts(accountId, config, data.alerts).catch((error) => console.error("[alerts] notify email failed", error));
  return json(data);
}
