import { loadConfig } from "@/server/config";
import { cameraImage } from "@/server/homeassistant";
import { notFound, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

/** A camera's current picture, for camera widgets and the doorbell pop-up. Only cameras the dashboard uses. */
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const entity = new URL(req.url).searchParams.get("e") ?? "";
  try {
    return (await cameraImage((await loadConfig()).config, entity)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
