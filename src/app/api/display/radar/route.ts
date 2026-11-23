import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { radarFeed } from "@/server/radar";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The times of the radar pictures (observed and forecast) for the dashboard's radar widgets.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  return json(await radarFeed((await loadConfig(accountId)).config));
}
