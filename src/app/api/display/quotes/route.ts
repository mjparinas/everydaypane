import { featureOn } from "@/server/featureFlags";
import { json, notFound, unauthorized } from "@/server/http";
import { quotesFeed } from "@/server/quotes";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  if (!(await featureOn(accountIdOf(viewer), "widget.quotes"))) return notFound();
  const url = new URL(req.url);
  const tags = (url.searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const count = Math.min(8, Math.max(1, Number(url.searchParams.get("count") ?? "3")));
  return json(await quotesFeed(tags, count));
}
