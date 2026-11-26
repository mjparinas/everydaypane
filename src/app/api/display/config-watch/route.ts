import { ensureAccountsSeeded } from "@/server/accounts";
import { changedFeeds, parseSeen, versions } from "@/server/changes";
import { json, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { accountIdOf, viewerFor } from "@/server/viewer";

export const runtime = "nodejs";
/** Long enough for a quiet long-poll on Vercel without sitting forever. */
export const maxDuration = 30;

const WAIT_MS = 22_000;
const TICK_MS = 1_000;

/**
 * Household displays hold this until the settings version moves past `since` or a family list's counter differs from
 * `seen` ("messages:3,shopping:5"), then the wall reloads (settings) or refetches just those lists (Melvin,
 * 2026-11-26: messages and other updates in seconds). With `feeds=1` and no `seen` it answers at once with the
 * counters, so a wall that just loaded learns them. Free plans get 403 and keep their timers (Melvin, 2026-11-22).
 */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  // Admin preview does not need push; wall devices only.
  if (viewer.kind !== "device") return unauthorized();
  const accountId = accountIdOf(viewer);
  if ((await planForAccount(accountId)) !== "paid") {
    return json({ error: "Instant refresh needs Household." }, 403);
  }
  const params = new URL(req.url).searchParams;
  const since = Number(params.get("since") ?? "0");
  const seen = parseSeen(params.get("seen"));
  await ensureAccountsSeeded();
  const deadline = Date.now() + WAIT_MS;
  let now = await versions(accountId);
  // `feeds=1` without `seen` is a wall asking for the counters (answered at once); neither is a wall still running the
  // display.js from before the counters, which waits on the settings version only until the release reloads it.
  const firstLook = !seen && params.get("feeds") === "1";
  if (!firstLook) {
    while (now.config <= since && (!seen || changedFeeds(seen, now.feeds).length === 0) && Date.now() < deadline && !req.signal.aborted) {
      await new Promise((r) => setTimeout(r, TICK_MS));
      now = await versions(accountId);
    }
  }
  return json({ version: now.config, feeds: now.feeds }, 200, { "Cache-Control": "no-store" });
}
