import { json, unauthorized } from "@/server/http";
import { newTodoistState, todoistConfigured, todoistConsentUrl, todoistRedirectUri } from "@/server/todoist";
import { adminFor } from "@/server/viewer";

const STATE_COOKIE = "ep_todoist_state";
const stateCookie = (value: string) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/api/todoist/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
};

export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  if (!todoistConfigured()) return json({ error: "TODOIST_CLIENT_ID and TODOIST_CLIENT_SECRET aren't set" }, 503);
  const state = newTodoistState();
  const origin = new URL(req.url).origin;
  return new Response(null, {
    status: 303,
    headers: {
      Location: todoistConsentUrl(state, todoistRedirectUri(origin)),
      "Set-Cookie": stateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}
