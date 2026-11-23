import { z } from "zod";

import { forget } from "@/server/cache";
import { loadConfig } from "@/server/config";
import { feedRange } from "@/server/google";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { checkIcal, getIcalUrl, normaliseIcalUrl, setIcalUrl } from "@/server/ical";
import { adminFor } from "@/server/viewer";

// Calendar links for the admin panel. The address goes in here and is stored encrypted; the panel only ever learns
// whether a link has one, and the link's name, colour and switch live in the settings document like Google's calendars.

const id = z.string().regex(/^[a-z0-9]{6,20}$/);

/** Which links have a stored address. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const { config } = await loadConfig(accountId);
  const ids = config.integrations.icals.map((l) => l.id);
  const set = await Promise.all(ids.map(async (i) => [i, Boolean(await getIcalUrl(accountId, i))] as const));
  return json({ links: Object.fromEntries(set) });
}

const body = z.object({ id, url: z.string().trim().min(8).max(2000) });

/** Checks a pasted address (it must load and read as a calendar) and stores it for the link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return json({ error: "Paste the calendar's address" }, 400);
  const checked = normaliseIcalUrl(parsed.data.url);
  if ("error" in checked) return json({ error: checked.error }, 400);
  const { config } = await loadConfig(accountId);
  const { from, to } = feedRange(Date.now(), config.location.timeZone);
  try {
    const found = await checkIcal(checked.url, from, to, config.location.timeZone);
    await setIcalUrl(accountId, parsed.data.id, checked.url);
    await forget(`ical:${parsed.data.id}:`);
    return json({ ok: true, ...found });
  } catch (error) {
    const message = error instanceof Error && !/fetch failed|aborted|timeout/i.test(error.message) ? error.message : "";
    return json({ error: message || "Couldn't load that calendar. Check the address and try again." }, 400);
  }
}

/** Forgets a link's address (the panel removes the link from the settings). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = id.safeParse(new URL(req.url).searchParams.get("id"));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  await setIcalUrl(accountId, parsed.data, null);
  await forget(`ical:${parsed.data}:`);
  return json({ ok: true });
}
