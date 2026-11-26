import { loadDisplayConfig } from "@/server/featureFlags";
import { cameraImage } from "@/server/homeassistant";
import { notFound, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** A camera's current picture, for camera widgets and the doorbell pop-up. Only cameras the dashboard uses. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const entity = new URL(req.url).searchParams.get("e") ?? "";
  try {
    return (await cameraImage(accountId, (await loadDisplayConfig(accountId)).config, entity)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
