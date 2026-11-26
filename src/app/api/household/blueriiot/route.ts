import { z } from "zod";

import { blueRiiotPools, BlueRiiotRefused, checkBlueRiiotLogin, saveBlueRiiotLogin } from "@/server/blueRiiot";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

// Settings › Pool: whether a Blue Riiot sign-in is saved, and its pools for the widget's picker. The email and password
// go in only; nothing here ever sends them back.

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  try {
    const pools = await blueRiiotPools(session.accountId);
    return json({ configured: pools !== null, pools: (pools ?? []).map(({ id, name }) => ({ id, name })), error: "" });
  } catch (e) {
    return json({
      configured: true,
      pools: [],
      error:
        e instanceof BlueRiiotRefused
          ? "Blue Riiot refused the saved sign-in. Enter it again."
          : "Couldn't reach Blue Riiot. Try again in a minute.",
    });
  }
}

const putBody = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Enter the email and password you use in the Blue Riiot app." }, 400);
  const email = parsed.data.email.trim();
  const { password } = parsed.data;
  let pools;
  try {
    pools = await checkBlueRiiotLogin(email, password);
  } catch (e) {
    if (e instanceof BlueRiiotRefused) return json({ error: "Blue Riiot didn't accept that email and password." }, 400);
    return json({ error: "Couldn't reach Blue Riiot to check it. Try again in a minute." }, 502);
  }
  await saveBlueRiiotLogin(session.accountId, { email, password });
  return json({ configured: true, pools, error: "" });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await saveBlueRiiotLogin(session.accountId, null);
  return json({ configured: false, pools: [], error: "" });
}
