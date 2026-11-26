import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { wildfireFeed } from "@/server/wildfires";

// Active wildfires, burned areas and evacuation areas around home, as pixels on the radar's map.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await wildfireFeed((await loadDisplayConfig(accountIdOf(viewer))).config));
}
