import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { sportsFeed } from "@/server/sports";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    return json(await sportsFeed((await loadConfig()).config));
  } catch {
    return json({ error: "Scores are unavailable right now" }, 502);
  }
}
