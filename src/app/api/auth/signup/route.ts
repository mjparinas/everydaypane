import { json } from "@/server/http";

/** @deprecated Free signup is Clerk at `/signin/?intent=signup` plus the `user.created` webhook. */
export async function POST() {
  return json({ error: "Create a household at /signin/?intent=signup.", redirect: "/signin/?intent=signup" }, 410);
}
