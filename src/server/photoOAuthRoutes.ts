import "server-only";

import { readCookie } from "./auth";
import { safeEqual } from "./crypto";
import { json, unauthorized } from "./http";
import {
  clearedPhotoOAuthStateCookie,
  connectPhotoOAuth,
  newPhotoOAuthState,
  PHOTO_OAUTH_STATE,
  photoOAuthConfigured,
  photoOAuthConsentUrl,
  photoOAuthRedirect,
  photoOAuthStateCookie,
  type PhotoOAuthService,
} from "./photoAuth";
import { adminFor } from "./viewer";

const ENV: Record<PhotoOAuthService, string> = {
  dropbox: "DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET",
  box: "BOX_CLIENT_ID and BOX_CLIENT_SECRET",
  flickr: "FLICKR_API_KEY and FLICKR_API_SECRET",
  smugmug: "SMUGMUG_API_KEY and SMUGMUG_API_SECRET",
};

export async function startPhotoOAuth(service: PhotoOAuthService, req: Request): Promise<Response> {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!photoOAuthConfigured(service)) return json({ error: `${ENV[service]} aren't set` }, 503);
  const state = newPhotoOAuthState();
  return new Response(null, {
    status: 303,
    headers: {
      Location: photoOAuthConsentUrl(service, state, photoOAuthRedirect(service, new URL(req.url).origin)),
      "Set-Cookie": photoOAuthStateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}

export async function finishPhotoOAuth(service: PhotoOAuthService, req: Request): Promise<Response> {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/admin/?${service}=${result}#settings/photos`,
        "Set-Cookie": clearedPhotoOAuthStateCookie(),
        "Cache-Control": "no-store",
      },
    });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, PHOTO_OAUTH_STATE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectPhotoOAuth(accountId, service, code, photoOAuthRedirect(service, url.origin));
  } catch (error) {
    console.error(`${service} connection failed`, error);
    return back("failed");
  }
  return back("connected");
}
