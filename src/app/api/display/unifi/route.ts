import { json, unauthorized } from "@/server/http";
import { unifiFeed } from "@/server/unifi";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  return json(await unifiFeed(accountIdOf(viewer)));
}
