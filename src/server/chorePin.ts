import "server-only";

import { createHmac } from "node:crypto";

import { safeEqual } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Child PIN for the chore chart (Melvin, 2026-11-23): hash only in secrets; config.chores.pinSet tells displays
// uncheck and redeem need it. Ticking chores on stays open without a PIN.

const PIN_RE = /^\d{4}$/;

function hashPin(pin: string): string {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(`everydaypane.chores.pin:${pin}`).digest("hex");
}

export async function choresPinSet(accountId: string): Promise<boolean> {
  return Boolean(await getSecret(accountId, "chores.pin"));
}

export async function setChoresPin(accountId: string, pin: string | null, now = Date.now()): Promise<"ok" | "bad"> {
  if (pin !== null && !PIN_RE.test(pin)) return "bad";
  await setSecret(accountId, "chores.pin", pin ? hashPin(pin) : null, now);
  return "ok";
}

export async function verifyChoresPin(accountId: string, pin: string): Promise<boolean> {
  if (!PIN_RE.test(pin)) return false;
  const stored = await getSecret(accountId, "chores.pin");
  if (!stored) return false;
  return safeEqual(stored, hashPin(pin));
}
