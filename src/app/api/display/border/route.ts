import { borderFeed } from "@/server/border";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await borderFeed((await loadDisplayConfig(accountIdOf(viewer))).config));
}
