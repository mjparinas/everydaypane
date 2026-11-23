import { recordPageView } from "@/server/adminAnalytics";
import { rateLimit } from "@/server/db";
import { clientIp, json, readJson } from "@/server/http";

/** Cookieless marketing site beacon (Tuned `/api/pv`). Skips /admin and /household. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`pv:${ip}`, 120, 60 * 60_000))) return json({ ok: false }, 429);
  const body = (await readJson(req, 8_000).catch(() => null)) as {
    path?: string;
    referrer?: string;
    utm_source?: string;
    utm_campaign?: string;
    track?: string;
    browser?: string;
    os?: string;
    device?: string;
  } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/household") || path.startsWith("/api")) {
    return json({ ok: true });
  }
  const gpc = req.headers.get("sec-gpc") === "1";
  if (gpc) return json({ ok: true });
  const country = req.headers.get("x-vercel-ip-country") || undefined;
  await recordPageView({
    path,
    referrer: body?.referrer,
    utmSource: body?.utm_source,
    utmCampaign: body?.utm_campaign,
    track: body?.track,
    browser: body?.browser,
    os: body?.os,
    device: body?.device,
    country,
    ip,
    ua: req.headers.get("user-agent") || "",
  });
  return json({ ok: true });
}
