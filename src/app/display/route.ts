import { NextResponse } from "next/server";

import { readCookie } from "@/server/auth";
import { tokenFromSealedCookie, unlockDisplayCookies, WALL_COOKIE, wallCookieFromRequest } from "@/server/displayAuth";
import { displayHtml } from "@/server/displayHtml";

/**
 * Wall entry (Melvin, 2026-11-23): unlocked browsers get the lightweight dashboard HTML; everyone else goes to the
 * unlock page (QR + phone, or signed-in picker). Bare `/d/<token>/` no longer serves the dashboard.
 */
export async function GET(req: Request) {
  const wall = readCookie(req, WALL_COOKIE);
  const token = await tokenFromSealedCookie(wall);
  const device = token ? await wallCookieFromRequest(req) : null;
  if (token && device) {
    const cookies = unlockDisplayCookies(token);
    const res = displayHtml({
      token,
      title: device.name,
      requestUrl: req.url,
    });
    const headers = new Headers(res.headers);
    for (const c of cookies) headers.append("Set-Cookie", c);
    return new Response(res.body, { status: res.status, headers });
  }

  // Never cache the locked redirect: a cached 307 would bounce a freshly unlocked wall back through
  // /display/unlock/ (and Next can flash a 404) before the dashboard loads.
  const locked = NextResponse.redirect(new URL("/display/unlock/", req.url));
  locked.headers.set("Cache-Control", "no-store");
  locked.headers.set("Vary", "Cookie");
  return locked;
}
