import { z } from "zod";

import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { savedQuota, saveTrackKey, trackQuota, TrackRefused } from "@/server/packages";
import { adminFor } from "@/server/viewer";

// Settings › Packages: whether a 17TRACK API key is saved and how much of its tracking quota is left. The key goes in
// only; nothing here ever sends it back.

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  try {
    const quota = await savedQuota(session.accountId);
    return json({ configured: quota !== null, ...(quota ?? {}), error: "" });
  } catch (e) {
    return json({
      configured: true,
      error:
        e instanceof TrackRefused ? "17TRACK refused the saved API key. Paste it again." : "Couldn't reach 17TRACK. Try again in a minute.",
    });
  }
}

const putBody = z.object({ apiKey: z.string().trim().min(16).max(100) });

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Paste the API key from 17TRACK's API dashboard." }, 400);
  let quota;
  try {
    quota = await trackQuota(parsed.data.apiKey);
  } catch (e) {
    if (e instanceof TrackRefused) return json({ error: "17TRACK didn't accept that API key." }, 400);
    return json({ error: "Couldn't reach 17TRACK to check it. Try again in a minute." }, 502);
  }
  await saveTrackKey(session.accountId, parsed.data.apiKey);
  return json({ configured: true, ...quota, error: "" });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await saveTrackKey(session.accountId, null);
  return json({ configured: false, error: "" });
}
