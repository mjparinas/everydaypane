import { loadConfig } from "@/server/config";
import { cameraList, findCameras } from "@/server/drivebc";
import { json, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

/** The highway cameras widget's search: by name, place, highway ("hwy 1") or id; the nearest with nothing typed. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  try {
    const list = await cameraList();
    return json({ cameras: findCameras(list, q, (await loadConfig(session.accountId)).config.location) });
  } catch {
    return json({ cameras: [], error: "DriveBC's camera list didn't load. Try again in a minute." }, 502);
  }
}
