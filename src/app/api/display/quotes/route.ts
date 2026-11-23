import { json, unauthorized } from "@/server/http";
import { quotesFeed } from "@/server/quotes";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const url = new URL(req.url);
  const tags = (url.searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const count = Math.min(8, Math.max(1, Number(url.searchParams.get("count") ?? "3")));
  return json(await quotesFeed(tags, count));
}
