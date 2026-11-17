import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { checkSources } from "@/server/photos";
import { adminFor } from "@/server/viewer";

/** Each saved photo source's state for the admin panel: how many photos it lists, and whether they load. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  return json(await checkSources((await loadConfig()).config));
}
