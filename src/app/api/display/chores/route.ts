import { z } from "zod";

import { choreBoard, choresTag, redeemChoreReward, setChoreDone } from "@/server/chores";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The chore chart for the chores widget: today's chores, who has them, what's done and the week's stars. Displays poll
// it every minute; an unchanged chart answers 304.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const body = await choreBoard(accountId, (await loadDisplayConfig(accountId)).config);
  const tag = choresTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}

const toggleBody = z.object({
  chore: z.string().min(1).max(64),
  person: z.string().min(1).max(64),
  done: z.boolean(),
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
const redeemBody = z.object({
  redeem: z.string().min(1).max(64),
  person: z.string().min(1).max(64),
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

/** A tap on the wall: tick chores, uncheck with PIN when set, or redeem a reward. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const config = (await loadDisplayConfig(accountId)).config;
  const raw = await readJson(req, 1000).catch(() => null);
  const redeem = redeemBody.safeParse(raw);
  if (redeem.success) {
    const result = await redeemChoreReward(accountId, config, {
      reward: redeem.data.redeem,
      person: redeem.data.person,
      pin: redeem.data.pin,
    });
    if (result === "ok") return json({ ok: true });
    if (result === "pin") return json({ error: "Wrong PIN." }, 403);
    if (result === "stars") return json({ error: "Not enough stars." }, 409);
    return json({ error: "Not allowed" }, 403);
  }
  const parsed = toggleBody.safeParse(raw);
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setChoreDone(accountId, config, parsed.data);
  if (result === "ok") return json({ ok: true });
  if (result === "pin") return json({ error: "Wrong PIN." }, 403);
  return json({ error: "Not allowed" }, 403);
}
