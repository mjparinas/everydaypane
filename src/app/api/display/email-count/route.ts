import { featureOn } from "@/server/featureFlags";
import { emailCountFeed } from "@/server/gmail";
import { json, notFound, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  if (!(await featureOn(accountIdOf(viewer), "widget.emailCount"))) return notFound();
  try {
    return json(await emailCountFeed(accountIdOf(viewer)));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, unread: 0 });
  }
}
