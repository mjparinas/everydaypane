import { json } from "@/server/http";

/** @deprecated Magic links replaced by Clerk email codes at `/signin/`. */
export async function POST() {
  return json({ error: "Sign in at /signin/ with an email code.", redirect: "/signin/" }, 410);
}
