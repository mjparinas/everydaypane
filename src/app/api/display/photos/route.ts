import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { photosFeed } from "@/server/photos";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  return json(await photosFeed((await loadConfig()).config));
}
