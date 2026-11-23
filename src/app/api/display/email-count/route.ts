import { emailCountFeed } from "@/server/gmail";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  try {
    return json(await emailCountFeed(accountIdOf(viewer)));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, unread: 0 });
  }
}
