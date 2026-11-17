import { alertsFeed } from "@/server/alerts";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  return json(await alertsFeed((await loadConfig()).config));
}
