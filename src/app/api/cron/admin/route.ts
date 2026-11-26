import { sendMorningDigest } from "@/server/adminAutomations";
import { env } from "@/server/env";
import { json, unauthorized } from "@/server/http";
import { runOnboarding } from "@/server/onboarding";

/** Hourly jobs: morning digest when Pacific morning arrives, and the day's getting-started emails. */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();
  const [digest, onboarding] = await Promise.all([sendMorningDigest(), runOnboarding()]);
  return json({ ok: true, digest, onboarding });
}
