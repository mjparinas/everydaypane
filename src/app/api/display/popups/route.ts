import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { listDisplayMessages } from "@/server/messages";
import { dismissPopup, popupState } from "@/server/popups";
import { accountIdOf, viewerFor } from "@/server/viewer";

// This screen's message pop-up state (src/server/popups.ts). Only a display device has one; anyone else (an admin
// looking at a wall page) gets 204 and the screen keeps its state in the browser instead.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "device") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const accountId = accountIdOf(viewer);
  const board = await listDisplayMessages(accountId);
  return json(await popupState(accountId, viewer.device.id, board));
}

const postBody = z.object({ dismiss: z.string().min(1).max(64) });

/** Dismisses a note on this screen only; the note stays on the board and on every other screen. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "device") return new Response(null, { status: 204 });
  const parsed = postBody.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  await dismissPopup(accountIdOf(viewer), viewer.device.id, parsed.data.dismiss);
  return json({ ok: true });
}
