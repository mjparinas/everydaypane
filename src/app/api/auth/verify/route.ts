import { json } from "@/server/http";

/** @deprecated Magic-link verify retired; Clerk handles email codes. */
export async function POST() {
  return json({ error: "That sign-in method is no longer used. Open /signin/." }, 410);
}
