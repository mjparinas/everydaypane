import { airportsFeed } from "@/server/airports";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await airportsFeed((await loadConfig(accountIdOf(viewer))).config));
}
