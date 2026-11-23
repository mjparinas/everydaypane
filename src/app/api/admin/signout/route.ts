import { signOutAdmin, staffEnabled } from "@/server/adminAuth";
import { json, notFound, sameOrigin } from "@/server/http";

export async function POST(req: Request) {
  if (!staffEnabled()) return notFound();
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  return signOutAdmin(req);
}
