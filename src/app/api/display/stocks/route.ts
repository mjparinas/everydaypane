import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { stocksFeed } from "@/server/stocks";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await stocksFeed((await loadConfig(accountIdOf(viewer))).config));
}
