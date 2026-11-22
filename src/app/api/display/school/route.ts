import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { schoolStatus } from "@/server/school";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  return json(await schoolStatus((await loadConfig()).config));
}
