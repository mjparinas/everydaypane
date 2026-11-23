import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { rssFeedFor } from "@/server/rssFeed";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const url = new URL(req.url);
  const widgetId = url.searchParams.get("widget") ?? "";
  const max = Math.min(30, Math.max(1, Number(url.searchParams.get("count") ?? "10")));
  const config = (await loadConfig(accountIdOf(viewer))).config;
  return json(await rssFeedFor(config, widgetId, max));
}
