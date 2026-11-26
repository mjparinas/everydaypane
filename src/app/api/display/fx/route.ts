import { loadDisplayConfig } from "@/server/featureFlags";
import { fxFeed } from "@/server/fx";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await fxFeed((await loadDisplayConfig(accountIdOf(viewer))).config));
}
