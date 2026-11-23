import { readCookie } from "@/server/auth";
import { safeEqual } from "@/server/crypto";
import { unauthorized } from "@/server/http";
import { connectTodoist, todoistRedirectUri } from "@/server/todoist";
import { adminFor } from "@/server/viewer";

const STATE_COOKIE = "ep_todoist_state";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/household/?todoist=${result}#settings/tasks`,
        "Set-Cookie": `${STATE_COOKIE}=; Path=/api/todoist/; HttpOnly; SameSite=Lax; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectTodoist(session.accountId, code, todoistRedirectUri(url.origin));
  } catch (error) {
    console.error("Todoist connection failed", error);
    return back("failed");
  }
  return back("connected");
}
