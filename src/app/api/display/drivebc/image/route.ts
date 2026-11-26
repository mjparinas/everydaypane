import { loadConfig } from "@/server/config";
import { driveBcImage } from "@/server/drivebc";
import { notFound, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** A DriveBC camera's current picture. Only cameras on this household's widgets; the address is built here. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const id = new URL(req.url).searchParams.get("c") ?? "";
  try {
    return (await driveBcImage((await loadConfig(accountIdOf(viewer))).config, id)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
