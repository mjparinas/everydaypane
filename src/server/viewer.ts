import "server-only";

import { requestSession, type Session } from "./auth";
import { deviceForToken, type Device } from "./devices";
import { displayCookieFromRequest } from "./displayAuth";

export { requestSession };

/** Who may read dashboard data: a display (token header, short-lived cookie, or legacy `?t=`) or a signed-in admin. */
export type Viewer = { kind: "device"; device: Device } | { kind: "person"; session: Session };

/**
 * A display device, or an admin (for the live preview). Family sessions stay on `/family/` and the meals/shopping/
 * messages APIs — they must not drive Home Assistant, cameras or tasks through `/api/display/`.
 */
export async function viewerFor(req: Request): Promise<Viewer | null> {
  const url = new URL(req.url);
  const token = req.headers.get("x-display-token") ?? url.searchParams.get("t");
  if (token) {
    const device = await deviceForToken(token);
    return device ? { kind: "device", device } : null;
  }
  const fromCookie = await displayCookieFromRequest(req);
  if (fromCookie) return { kind: "device", device: fromCookie };
  const session = await requestSession(req);
  return session?.role === "admin" ? { kind: "person", session } : null;
}

export async function adminFor(req: Request): Promise<Session | null> {
  const session = await requestSession(req);
  return session?.role === "admin" ? session : null;
}
