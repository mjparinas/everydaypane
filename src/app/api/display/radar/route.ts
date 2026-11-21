import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { radarFeed } from "@/server/radar";
import { viewerFor } from "@/server/viewer";

// The times of the radar pictures (observed and forecast) for the dashboard's radar widgets.
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  return json(await radarFeed((await loadConfig()).config));
}
