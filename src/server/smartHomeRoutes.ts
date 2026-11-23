import "server-only";

import type { NativeSmartProvider } from "@/lib/smartHome";

import { readCookie } from "./auth";
import { safeEqual } from "./crypto";
import { json, unauthorized } from "./http";
import {
  clearedSmartStateCookie,
  connectSmartHome,
  newSmartState,
  SMART_STATE_COOKIE,
  smartConfigured,
  smartConsentUrl,
  smartRedirectUri,
  smartStateCookie,
} from "./smartHomeAuth";
import { adminFor } from "./viewer";

const ENV_NAMES: Record<NativeSmartProvider, string> = {
  nest: "NEST_PROJECT_ID and Google OAuth client (or NEST_CLIENT_ID / NEST_CLIENT_SECRET)",
  ecobee: "ECOBEE_CLIENT_ID and ECOBEE_CLIENT_SECRET",
  smartthings: "SMARTTHINGS_CLIENT_ID and SMARTTHINGS_CLIENT_SECRET",
};

export async function startSmartHomeConnect(provider: NativeSmartProvider, req: Request): Promise<Response> {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!smartConfigured(provider)) return json({ error: `${ENV_NAMES[provider]} aren't set` }, 503);
  const state = newSmartState();
  return new Response(null, {
    status: 303,
    headers: {
      Location: smartConsentUrl(provider, state, smartRedirectUri(provider, new URL(req.url).origin)),
      "Set-Cookie": smartStateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}

export async function finishSmartHomeConnect(provider: NativeSmartProvider, req: Request): Promise<Response> {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/household/?${provider}=${result}#settings/smart-home`,
        "Set-Cookie": clearedSmartStateCookie(),
        "Cache-Control": "no-store",
      },
    });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, SMART_STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectSmartHome(accountId, provider, code, smartRedirectUri(provider, url.origin));
  } catch (error) {
    console.error(`${provider} connection failed`, error);
    return back("failed");
  }
  return back("connected");
}
