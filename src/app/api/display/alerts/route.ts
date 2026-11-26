import { rank } from "@/lib/alerts";
import { indoorAlertsFor } from "@/server/airthings";
import { notifyNewStripAlerts } from "@/server/alertNotify";
import { alertsFeed } from "@/server/alerts";
import { poolAlertsFor } from "@/server/blueRiiot";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  // High radon and CO₂ from Airthings (Settings › Indoor air) and pool water far out of range from Blue Riiot
  // (Settings › Pool) join the area's alerts when switched on; one failing never hides the others.
  const [area, indoor, pool] = await Promise.all([
    alertsFeed(config),
    indoorAlertsFor(accountId, config).catch(() => []),
    poolAlertsFor(accountId, config).catch(() => []),
  ]);
  const home = [...indoor, ...pool];
  const data = home.length
    ? { ...area, alerts: [...area.alerts, ...home].sort((a, b) => rank(a.severity) - rank(b.severity) || b.sent - a.sent) }
    : area;
  void notifyNewStripAlerts(accountId, config, data.alerts).catch((error) => console.error("[alerts] notify email failed", error));
  return json(data);
}
