import { sendMorningDigest } from "@/server/adminAutomations";
import { env } from "@/server/env";
import { json, unauthorized } from "@/server/http";

/** Hourly admin jobs: morning digest when Pacific morning arrives. */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();
  const result = await sendMorningDigest();
  return json({ ok: true, digest: result });
}
