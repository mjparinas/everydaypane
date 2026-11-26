import "server-only";

import { keyState, keyVarNames, PLATFORM_KEYS, unconfiguredFlags, type KeyState } from "@/lib/platformKeys";

import { stripeEnabled } from "./billing";
import { query } from "./db";
import { env } from "./env";

export type SettingRow = { name: string; group: string; powers: string; state: KeyState; label?: string; docs?: string; hides?: boolean };

const hasEnv = (name: string) => Boolean(process.env[name]?.trim());

/** Each integration key's state on this deploy (names only, never values). */
export function platformKeyRows(): SettingRow[] {
  return PLATFORM_KEYS.map((k) => ({
    name: keyVarNames(k).join(" + "),
    label: k.label,
    group: k.group,
    powers: k.powers,
    docs: k.docs,
    // Missing, this key hides widgets or providers from the household panel.
    hides: k.unlocks.length > 0,
    state: keyState(k, hasEnv),
  }));
}

/** Ids of the integration keys that are fully set on this deploy. */
export function readyPlatformKeys(): Set<string> {
  return new Set(PLATFORM_KEYS.filter((k) => keyState(k, hasEnv) === "set").map((k) => k.id));
}

/** Household-panel flag names hidden because their platform key is missing. */
export function unconfiguredFlagsNow(): string[] {
  return unconfiguredFlags(readyPlatformKeys());
}

/** Env checklist for System tab — names only, never values. */
export function settingsChecklist(): SettingRow[] {
  const rows: SettingRow[] = [
    {
      name: "SESSION_SECRET",
      group: "Core",
      powers: "Sessions and sealed secrets",
      state: env.sessionSecret().length >= 32 ? "set" : "missing",
    },
    {
      name: "DATABASE_URL / TURSO_*",
      group: "Core",
      powers: "Turso / libsql",
      state: env.databaseUrl() ? "set" : "missing",
    },
    { name: "NEXT_PUBLIC_SITE_URL", group: "Core", powers: "Canonical site URL", state: env.siteUrl() ? "set" : "missing" },
    {
      name: "CLERK_SECRET_KEY",
      group: "Auth",
      powers: "Household + staff identity",
      state: env.clerkSecretKey().startsWith("sk_") ? "set" : "missing",
    },
    {
      name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      group: "Auth",
      powers: "Clerk browser SDK",
      state: env.clerkPublishableKey().startsWith("pk_") ? "set" : "missing",
    },
    {
      name: "CLERK_WEBHOOK_SIGNING_SECRET",
      group: "Auth",
      powers: "user.created → Free household",
      state: env.clerkWebhookSecret() ? "set" : "missing",
    },
    { name: "ADMIN_EMAILS", group: "Admin", powers: "Platform staff", state: env.adminEmails().size ? "set" : "missing" },
    { name: "ANALYTICS_SECRET", group: "Admin", powers: "Cookieless visitor hash", state: env.analyticsSecret() ? "set" : "missing" },
    { name: "RESEND_API_KEY", group: "Email", powers: "Outbound mail", state: env.resendKey() ? "set" : "missing" },
    { name: "MAIL_FROM", group: "Email", powers: "From address", state: process.env.MAIL_FROM ? "set" : "missing" },
    { name: "RESEND_INBOX_API_KEY", group: "Email", powers: "Admin Inbox", state: env.resendInboxKey() ? "set" : "missing" },
    {
      name: "STRIPE_SECRET_KEY + STRIPE_PRICE_ID",
      group: "Billing",
      powers: "Household Checkout",
      state: stripeEnabled() ? "set" : env.stripeSecretKey() || env.stripePriceId() ? "partly" : "missing",
    },
    { name: "STRIPE_WEBHOOK_SECRET", group: "Billing", powers: "Stripe webhooks", state: env.stripeWebhookSecret() ? "set" : "missing" },
    { name: "CRON_SECRET", group: "Jobs", powers: "Scheduled digests", state: env.cronSecret() ? "set" : "missing" },
    { name: "GITHUB_TOKEN", group: "Monitoring", powers: "CI status (optional)", state: env.githubToken() ? "set" : "missing" },
    { name: "VERCEL_TOKEN", group: "Monitoring", powers: "Deploy history (optional)", state: env.vercelToken() ? "set" : "missing" },
    {
      name: "GOOGLE_SERVICE_ACCOUNT_KEY",
      group: "Search",
      powers: "Search Console in Traffic",
      state: env.googleServiceAccountKey() ? "set" : "missing",
    },
    { name: "BING_WEBMASTER_API_KEY", group: "Search", powers: "Bing in Traffic", state: env.bingWebmasterKey() ? "set" : "missing" },
  ];
  return rows;
}

export async function systemHealth() {
  const t0 = Date.now();
  let dbOk = false;
  let dbMs = 0;
  try {
    await query("SELECT 1 AS ok");
    dbOk = true;
    dbMs = Date.now() - t0;
  } catch {
    dbMs = Date.now() - t0;
  }
  const dayAgo = Date.now() - 86_400_000;
  const fails = await query<{ n: number }>("SELECT COUNT(*) AS n FROM staff_sign_in_failures WHERE at > ?", [dayAgo]);
  const accounts = await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts");
  const devices = await query<{ n: number }>("SELECT COUNT(*) AS n FROM devices");
  return {
    database: { ok: dbOk, ms: dbMs },
    counts: { accounts: Number(accounts[0]?.n ?? 0), devices: Number(devices[0]?.n ?? 0) },
    failedSignInsToday: Number(fails[0]?.n ?? 0),
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) ?? "dev",
    vercelEnv: process.env.VERCEL_ENV ?? "local",
    settings: settingsChecklist(),
    keys: platformKeyRows(),
  };
}
