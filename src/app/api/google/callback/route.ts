import { readCookie } from "@/server/auth";
import { loadConfig, saveConfig } from "@/server/config";
import { safeEqual } from "@/server/crypto";
import { clearedStateCookie, connect, listCalendars, redirectUri, STATE_COOKIE } from "@/server/google";
import { unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

// Google sends the admin back here after the consent screen. The code is traded for a refresh token (stored
// encrypted), and on a first connection the account's own calendar is switched on so displays show it straight away.
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `/household/?google=${result}#settings`, "Set-Cookie": clearedStateCookie(), "Cache-Control": "no-store" },
    });

  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");

  try {
    await connect(accountId, code, redirectUri(url.origin));
  } catch (error) {
    console.error("Google connection failed", error);
    return back("failed");
  }
  try {
    const stored = await loadConfig(accountId);
    if (stored.config.integrations.google.calendars.length === 0) {
      const calendars = await listCalendars(accountId);
      const config = structuredClone(stored.config);
      config.integrations.google.calendars = calendars
        .slice(0, 50)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, enabled: c.primary }));
      await saveConfig(accountId, config, stored.version);
    }
  } catch (error) {
    // Connected all the same: the calendars can be picked in the admin panel.
    console.error("Couldn't list Google calendars", error);
  }
  return back("connected");
}
