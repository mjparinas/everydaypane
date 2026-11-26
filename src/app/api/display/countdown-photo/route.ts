import { countdownPhoto } from "@/server/countdownPhotos";
import { loadDisplayConfig } from "@/server/featureFlags";
import { notFound, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// A birthday or anniversary photo for the countdown widget. Walls get only photos a saved countdown widget names; an
// admin's preview gets any of the household's own, so a new photo shows before Publish.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const id = new URL(req.url).searchParams.get("i") ?? "";
  try {
    const { config } = await loadDisplayConfig(accountId);
    return (await countdownPhoto(accountId, config, id, viewer.kind !== "device")) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
