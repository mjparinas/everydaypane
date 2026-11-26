import { driveBcImage } from "@/server/drivebc";
import { loadDisplayConfig } from "@/server/featureFlags";
import { notFound, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** A DriveBC camera's current picture. Only cameras on this household's widgets; the address is built here. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const id = new URL(req.url).searchParams.get("c") ?? "";
  try {
    return (await driveBcImage((await loadDisplayConfig(accountIdOf(viewer))).config, id)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
