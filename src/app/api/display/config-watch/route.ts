import { configVersion } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { accountIdOf, viewerFor } from "@/server/viewer";

export const runtime = "nodejs";
/** Long enough for a quiet long-poll on Vercel without sitting forever. */
export const maxDuration = 30;

const WAIT_MS = 22_000;
const TICK_MS = 1_000;

/**
 * Household displays hold this until the settings version moves past `since`, then reload state.
 * Free plans get 403 and keep the 30-second poll (Melvin, 2026-11-22).
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
  const since = Number(new URL(req.url).searchParams.get("since") ?? "0");
  const deadline = Date.now() + WAIT_MS;
  let version = await configVersion(accountId);
  while (version <= since && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, TICK_MS));
    version = await configVersion(accountId);
  }
  return json({ version }, 200, { "Cache-Control": "no-store" });
}
