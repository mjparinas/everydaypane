import { dadJokeFeed } from "@/server/dadJoke";
import { featureOn } from "@/server/featureFlags";
import { json, notFound, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  if (!(await featureOn("widget.dadJoke"))) return notFound();
  const safe = new URL(req.url).searchParams.get("safe") !== "0";
  return json(await dadJokeFeed(safe));
}
