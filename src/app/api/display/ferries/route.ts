import { loadConfig } from "@/server/config";
import { ferriesFeed } from "@/server/ferries";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  return json(await ferriesFeed((await loadConfig()).config));
}
