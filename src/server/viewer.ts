import "server-only";

import { requestSession, type Session } from "./auth";
import { deviceForToken, type Device } from "./devices";

export { requestSession };

/** Who may read dashboard data: a display (its token in the `x-display-token` header or `?t=`) or a signed-in person. */
export type Viewer = { kind: "device"; device: Device } | { kind: "person"; session: Session };

export async function viewerFor(req: Request): Promise<Viewer | null> {
  const url = new URL(req.url);
  const token = req.headers.get("x-display-token") ?? url.searchParams.get("t");
  if (token) {
    const device = await deviceForToken(token);
    return device ? { kind: "device", device } : null;
  }
  const session = await requestSession(req);
  return session ? { kind: "person", session } : null;
}

export async function adminFor(req: Request): Promise<Session | null> {
  const session = await requestSession(req);
  return session?.role === "admin" ? session : null;
}
