import { z } from "zod";

import { requestSession } from "@/server/auth";
import { rateLimit } from "@/server/db";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { bearerToken, MOBILE_PLATFORMS, publicDevice, PUSH_ENVS, registerMobileDevice } from "@/server/mobile";
import { pushConfigured } from "@/server/push";

// The Everydaypane app registers itself here from the page the person is signed in on (Melvin, 2026-11-27). The
// answer carries the app token once (for the phone's widgets and home geofence, kept by the native side only) and
// home's coordinates for the geofence, which the page never shows.

const body = z.object({
  platform: z.enum(MOBILE_PLATFORMS),
  name: z.string().trim().min(1).max(60),
  // APNs tokens are 64 hex characters; FCM's are about 160 characters of base64-ish text.
  pushToken: z
    .string()
    .regex(/^[A-Za-z0-9:_-]{32,4096}$/)
    .nullable(),
  pushEnv: z.enum(PUSH_ENVS).default("production"),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await requestSession(req);
  if (!session) return unauthorized();
  if (!(await rateLimit(`mobile-register:${session.email}`, 60, 60 * 60_000))) return json({ error: "Try again later" }, 429);
  const parsed = body.safeParse(await readJson(req, 8_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const result = await registerMobileDevice(session, parsed.data, bearerToken(req));
  if (!result.ok) return json({ error: "This household has too many phones signed in. Remove one first." }, 409);
  const { config } = await loadDisplayConfig(session.accountId);
  const { latitude, longitude } = config.location;
  return json({
    device: publicDevice(result.device),
    appToken: result.appToken,
    home: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
    push: pushConfigured(),
  });
}
