import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { trelloFeed } from "@/server/trello";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const url = new URL(req.url);
  const accountId = accountIdOf(viewer);
  const config = (await loadDisplayConfig(accountId)).config;
  const boardId = url.searchParams.get("board") ?? "";
  const listCount = Math.min(8, Math.max(1, Number(url.searchParams.get("lists") ?? "4")));
  const cardCount = Math.min(12, Math.max(1, Number(url.searchParams.get("cards") ?? "6")));
  try {
    return json(await trelloFeed(accountId, config, boardId, listCount, cardCount));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, boardName: "", lists: [] });
  }
}
