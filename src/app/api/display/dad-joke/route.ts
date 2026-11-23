import { dadJokeFeed } from "@/server/dadJoke";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const safe = new URL(req.url).searchParams.get("safe") !== "0";
  return json(await dadJokeFeed(safe));
}
