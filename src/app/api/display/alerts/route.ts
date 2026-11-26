import { rank } from "@/lib/alerts";
import { indoorAlertsFor } from "@/server/airthings";
import { notifyNewStripAlerts } from "@/server/alertNotify";
import { alertsFeed } from "@/server/alerts";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { laundryAlertsFor } from "@/server/laundry";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  // High radon and CO₂ from Airthings (Settings › Indoor air) and "washer done" notices (Settings › Laundry) join the
  // area's alerts; one failing never hides the others.
  const [area, indoor, laundry] = await Promise.all([
    alertsFeed(config),
    indoorAlertsFor(accountId, config).catch(() => []),
    laundryAlertsFor(accountId, config).catch(() => []),
  ]);
  const extra = [...indoor, ...laundry];
  const data = extra.length
    ? { ...area, alerts: [...area.alerts, ...extra].sort((a, b) => rank(a.severity) - rank(b.severity) || b.sent - a.sent) }
    : area;
  void notifyNewStripAlerts(accountId, config, data.alerts).catch((error) => console.error("[alerts] notify email failed", error));
  return json(data);
}
