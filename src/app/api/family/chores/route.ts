import { z } from "zod";

import { choreBoard, choresTag, redeemChoreReward, setChoreDone } from "@/server/chores";
import { loadConfig } from "@/server/config";
import { familyEditorAccountId, familyEditorFor } from "@/server/familyAuth";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";

// Kids chores phone API (Melvin, 2026-11-23): same chart as the wall, for `/family/chores/` and `/d/<token>/chores/`.
// Auth is a family session or the display token (like meals/shopping). Ticks skip the wall's allowCheck gate.

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const body = await choreBoard(accountId, (await loadConfig(accountId)).config);
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

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const config = (await loadConfig(accountId)).config;
  const raw = await readJson(req, 1000).catch(() => null);
  const redeem = redeemBody.safeParse(raw);
  if (redeem.success) {
    const result = await redeemChoreReward(accountId, config, {
      reward: redeem.data.redeem,
      person: redeem.data.person,
      pin: redeem.data.pin,
      fromPhone: true,
    });
    if (result === "ok") return json({ ok: true });
    if (result === "pin") return json({ error: "Wrong PIN." }, 403);
    if (result === "stars") return json({ error: "Not enough stars." }, 409);
    return json({ error: "Not allowed" }, 403);
  }
  const parsed = toggleBody.safeParse(raw);
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  const result = await setChoreDone(accountId, config, { ...parsed.data, fromPhone: true });
  if (result === "ok") return json({ ok: true });
  if (result === "pin") return json({ error: "Wrong PIN." }, 403);
  return json({ error: "Not allowed" }, 403);
}
