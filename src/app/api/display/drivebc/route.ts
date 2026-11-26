import { loadConfig } from "@/server/config";
import { driveBcFeed } from "@/server/drivebc";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** Status (name, last new picture, late or off) of the DriveBC cameras on this household's widgets. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await driveBcFeed((await loadConfig(accountIdOf(viewer))).config));
}
