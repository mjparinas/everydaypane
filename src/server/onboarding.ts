import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { dueStep, liveSteps, ONBOARDING, ONBOARDING_SINCE, type SentStep } from "@/lib/onboarding";
import { onboardingMail } from "@/lib/onboardingEmail";
import type { PlanId } from "@/lib/plans";

import { LEGACY_ACCOUNT_ID } from "./accounts";
import { getAutomations } from "./adminAutomations";
import { loadConfig } from "./config";
import { query, run } from "./db";
import { env } from "./env";
import { flagsOff } from "./featureFlags";
import { sendEmailBatch, type OutgoingMail } from "./mail";

// Sends the getting-started emails (src/lib/onboarding.ts) from the hourly job (/api/cron/admin/). Built for a busy
// hour: one query finds every household still in the series with its admins, one finds what they've had, one finds
// who unsubscribed; settings are read only for households with something due, and everything due goes to Resend in
// batches of 100. Each email is claimed (a row in onboarding_sends) before it's sent and handed back if Resend refuses,
// so overlapping or repeated runs never send one twice.

const KIND = "onboarding";
/** Long enough for 18 emails a day apart with room for missed runs; older households drop out of the query. */
const WINDOW_MS = 45 * 86_400_000;
const BATCH = 100;

function unsubscribeToken(email: string): string {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(`unsubscribe:${KIND}:${email.toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function unsubscribeUrl(email: string): string {
  return `${env.siteUrl()}/api/email/unsubscribe/?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

export function validUnsubscribe(email: string, token: string): boolean {
  if (!email.includes("@")) return false;
  const a = Buffer.from(unsubscribeToken(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Records the opt-out. Idempotent: a second click (or a mail scanner's) changes nothing. */
export async function unsubscribe(email: string, now = Date.now()): Promise<void> {
  await run("INSERT OR IGNORE INTO email_optouts (email, kind, at) VALUES (?, ?, ?)", [email.toLowerCase(), KIND, now]);
}

export async function isUnsubscribed(email: string): Promise<boolean> {
  return (await query("SELECT 1 FROM email_optouts WHERE email = ? AND kind = ?", [email.toLowerCase(), KIND])).length > 0;
}

interface Candidate {
  account_id: string;
  plan: string;
  created_at: number;
  email: string;
}

export type OnboardingResult = { sent: number; reason?: string };

export async function runOnboarding(now = Date.now(), send: typeof fetch = fetch): Promise<OnboardingResult> {
  if (!(await getAutomations()).onboarding) return { sent: 0, reason: "off" };
  const postal = env.mailPostalAddress();
  if (!postal) {
    if (env.isProduction()) return { sent: 0, reason: "MAIL_POSTAL_ADDRESS not set" };
  }
  const since = Math.max(ONBOARDING_SINCE, now - WINDOW_MS);
  const candidates = await query<Candidate>(
    `SELECT a.id AS account_id, a.plan, a.created_at, m.email FROM accounts a
     JOIN account_members m ON m.account_id = a.id AND m.role = 'admin'
     WHERE a.created_at >= ? AND a.id != ?
       AND NOT EXISTS (SELECT 1 FROM email_optouts o WHERE o.email = m.email AND o.kind = ?)`,
    [since, LEGACY_ACCOUNT_ID, KIND],
  );
  if (!candidates.length) return { sent: 0 };

  const sentRows = await query<{ account_id: string; email: string; step: string; sent_at: number }>(
    `SELECT s.account_id, s.email, s.step, s.sent_at FROM onboarding_sends s JOIN accounts a ON a.id = s.account_id WHERE a.created_at >= ?`,
    [since],
  );
  const sentBy = new Map<string, SentStep[]>();
  for (const r of sentRows) {
    const k = `${r.account_id} ${r.email}`;
    sentBy.set(k, [...(sentBy.get(k) ?? []), { step: r.step, sentAt: Number(r.sent_at) }]);
  }

  const off = await flagsOff(now);
  const steps = liveSteps((f) => !off.has(f));
  const allIds = new Set(ONBOARDING.map((s) => s.id));
  const zones = new Map<string, string>();
  const due: { c: Candidate; mail: OutgoingMail; step: string }[] = [];

  for (const c of candidates) {
    const sent = sentBy.get(`${c.account_id} ${c.email}`) ?? [];
    // Everything had (or switched off): nothing to work out, and no settings read.
    if (steps.every((s) => sent.some((x) => x.step === s.id)) || sent.length >= allIds.size) continue;
    let tz = zones.get(c.account_id);
    if (!tz) {
      tz = (await loadConfig(c.account_id)).config.location.timeZone || "America/Vancouver";
      zones.set(c.account_id, tz);
    }
    const next = dueStep(steps, sent, Number(c.created_at), tz, now);
    if (!next) continue;
    const unsub = unsubscribeUrl(c.email);
    const mail = onboardingMail({
      step: next.step,
      n: next.n,
      total: next.total,
      plan: (c.plan === "paid" ? "paid" : "free") satisfies PlanId,
      siteUrl: env.siteUrl(),
      unsubscribeUrl: unsub,
      postalAddress: postal || "(postal address not set)",
    });
    due.push({
      c,
      step: next.step.id,
      mail: {
        to: c.email,
        ...mail,
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      },
    });
  }

  let sent = 0;
  for (let i = 0; i < due.length; i += BATCH) {
    const chunk = due.slice(i, i + BATCH);
    // Claim first; a row another run already holds means that one is sending it.
    const mine: typeof chunk = [];
    for (const d of chunk) {
      const claimed = await run("INSERT OR IGNORE INTO onboarding_sends (account_id, email, step, sent_at) VALUES (?, ?, ?, ?)", [
        d.c.account_id,
        d.c.email,
        d.step,
        now,
      ]);
      if (claimed) mine.push(d);
    }
    if (!mine.length) continue;
    const key = `onboarding-${mine.map((d) => `${d.c.account_id}:${d.step}`).join(",")}`;
    const ok = await sendEmailBatch(
      mine.map((d) => d.mail),
      // Resend keeps idempotency keys a day; a hash keeps the key short however many are in the batch.
      `onboarding-${createHmac("sha256", "onboarding").update(key).digest("base64url")}`,
      send,
    ).catch(() => false);
    if (ok) {
      sent += mine.length;
    } else {
      for (const d of mine)
        await run("DELETE FROM onboarding_sends WHERE account_id = ? AND email = ? AND step = ? AND sent_at = ?", [
          d.c.account_id,
          d.c.email,
          d.step,
          now,
        ]);
    }
  }
  return { sent };
}
