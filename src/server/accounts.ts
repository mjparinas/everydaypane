import "server-only";

import { freeDefaultConfig } from "@/lib/config/defaults";
import { PLAN_IDS, type PlanId } from "@/lib/plans";

import { randomToken } from "./crypto";
import { query, run } from "./db";
import { env } from "./env";

// Multi-tenant households (Melvin, 2026-11-22: Everydaypane as a paid app others can use). One account owns
// settings, displays, secrets and family data. Members are admin (dashboard) or family (phone surfaces only).

export const LEGACY_ACCOUNT_ID = "acct_legacy";

export type MemberRole = "admin" | "family";

export interface Account {
  id: string;
  name: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: number;
}

export interface AccountMember {
  accountId: string;
  email: string;
  role: MemberRole;
  createdAt: number;
}

type AccountRow = {
  id: string;
  name: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: number;
};

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  plan: r.plan === "paid" ? "paid" : "free",
  stripeCustomerId: r.stripe_customer_id,
  stripeSubscriptionId: r.stripe_subscription_id,
  createdAt: Number(r.created_at),
});

let seeded: Promise<void> | null = null;

/** Tests only: re-run seed after resetForTests(). */
export function resetAccountsForTests(): void {
  seeded = null;
}

/** Ensures the grandfather household exists (existing data → Paid) and env emails are members. Idempotent. */
export function ensureAccountsSeeded(now = Date.now()): Promise<void> {
  seeded ??= seedOnce(now).catch((e) => {
    seeded = null;
    throw e;
  });
  return seeded;
}

async function seedOnce(now: number): Promise<void> {
  const existing = await query<{ id: string }>("SELECT id FROM accounts LIMIT 1");
  if (!existing[0]) {
    const admins = [...env.adminEmails()];
    const name = admins[0] ? `${admins[0].split("@")[0]}'s home` : "Home";
    // Existing single-household installs keep every feature (Melvin's kitchen wall).
    await run(
      "INSERT INTO accounts (id, name, plan, stripe_customer_id, stripe_subscription_id, created_at) VALUES (?, ?, 'paid', NULL, NULL, ?)",
      [LEGACY_ACCOUNT_ID, name, now],
    );
    await migrateLegacyData(LEGACY_ACCOUNT_ID, now);
  }

  const accountId = (await query<{ id: string }>("SELECT id FROM accounts ORDER BY created_at LIMIT 1"))[0]?.id;
  if (!accountId) return;

  for (const email of env.adminEmails()) await upsertMember(accountId, email, "admin", now);
  for (const email of env.familyEmails()) {
    if (!env.adminEmails().has(email)) await upsertMember(accountId, email, "family", now);
  }
}

async function migrateLegacyData(accountId: string, now: number): Promise<void> {
  const cfg = await query<{ json: string; version: number; updated_at: number }>(
    "SELECT json, version, updated_at FROM config WHERE id = 1",
  );
  if (cfg[0]) {
    await run("INSERT OR IGNORE INTO account_config (account_id, json, version, updated_at) VALUES (?, ?, ?, ?)", [
      accountId,
      cfg[0].json,
      Number(cfg[0].version),
      Number(cfg[0].updated_at),
    ]);
  } else {
    await run("INSERT OR IGNORE INTO account_config (account_id, json, version, updated_at) VALUES (?, ?, 0, ?)", [accountId, "{}", now]);
  }

  const secrets = await query<{ key: string; value: string; updated_at: number }>("SELECT key, value, updated_at FROM secrets");
  for (const s of secrets) {
    await run("INSERT OR IGNORE INTO account_secrets (account_id, key, value, updated_at) VALUES (?, ?, ?, ?)", [
      accountId,
      s.key,
      s.value,
      Number(s.updated_at),
    ]);
  }

  await run("UPDATE devices SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);
  await run("UPDATE messages SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);
  await run("UPDATE photos SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);
  await run("UPDATE shopping SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);
  await run("UPDATE family_events SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);
  await run("UPDATE sessions SET account_id = ? WHERE account_id IS NULL OR account_id = ''", [accountId]);

  const meals = await query<{ date: string; slot: string; text: string; updated_at: number; updated_by: string }>(
    "SELECT date, slot, text, updated_at, updated_by FROM meals",
  );
  for (const m of meals) {
    await run("INSERT OR IGNORE INTO account_meals (account_id, date, slot, text, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)", [
      accountId,
      m.date,
      m.slot,
      m.text,
      Number(m.updated_at),
      m.updated_by,
    ]);
  }
  const chores = await query<{ date: string; chore_id: string; person_id: string; stars: number; done_at: number }>(
    "SELECT date, chore_id, person_id, stars, done_at FROM chores_done",
  );
  for (const c of chores) {
    await run(
      "INSERT OR IGNORE INTO account_chores_done (account_id, date, chore_id, person_id, stars, done_at) VALUES (?, ?, ?, ?, ?, ?)",
      [accountId, c.date, c.chore_id, c.person_id, Number(c.stars), Number(c.done_at)],
    );
  }
  const alerts = await query<{ id: string; sent_at: number }>("SELECT id, sent_at FROM alert_notified");
  for (const a of alerts) {
    await run("INSERT OR IGNORE INTO account_alert_notified (account_id, id, sent_at) VALUES (?, ?, ?)", [
      accountId,
      a.id,
      Number(a.sent_at),
    ]);
  }
}

export async function createAccount(name: string, adminEmail: string, now = Date.now()): Promise<Account> {
  await ensureAccountsSeeded(now);
  const e = adminEmail.trim().toLowerCase();
  const existing = await accountsForEmail(e);
  if (existing[0]) {
    const already = await accountById(existing[0].accountId);
    if (already) return already;
  }

  const id = `acct_${randomToken(12)}`;
  // Claim the email first so two parallel Free signups cannot create two households.
  const claimed = await run("INSERT OR IGNORE INTO signup_emails (email, account_id, created_at) VALUES (?, ?, ?)", [e, id, now]);
  if (claimed === 0) {
    for (let i = 0; i < 40; i++) {
      const members = await accountsForEmail(e);
      if (members[0]) {
        const won = await accountById(members[0].accountId);
        if (won) return won;
      }
      const claim = (await query<{ account_id: string }>("SELECT account_id FROM signup_emails WHERE email = ?", [e]))[0];
      if (claim) {
        const won = await accountById(claim.account_id);
        if (won) return won;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Couldn't finish signup. Try again in a moment.");
  }

  await run(
    "INSERT INTO accounts (id, name, plan, stripe_customer_id, stripe_subscription_id, created_at) VALUES (?, ?, 'free', NULL, NULL, ?)",
    [id, name.trim() || "Home", now],
  );
  // Seed a Free-safe document (not "{}") so the wall and first Save match the marketed Free tier.
  await run("INSERT INTO account_config (account_id, json, version, updated_at) VALUES (?, ?, 0, ?)", [
    id,
    JSON.stringify(freeDefaultConfig()),
    now,
  ]);
  await upsertMember(id, e, "admin", now);
  return (await accountById(id))!;
}

export async function accountById(id: string): Promise<Account | null> {
  await ensureAccountsSeeded();
  const row = (await query<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id]))[0];
  return row ? toAccount(row) : null;
}

export async function setAccountPlan(accountId: string, plan: PlanId): Promise<void> {
  if (!PLAN_IDS.includes(plan)) throw new Error("Invalid plan");
  await run("UPDATE accounts SET plan = ? WHERE id = ?", [plan, accountId]);
}

export async function setStripeIds(
  accountId: string,
  patch: { customerId?: string | null; subscriptionId?: string | null },
): Promise<void> {
  if (patch.customerId !== undefined) {
    await run("UPDATE accounts SET stripe_customer_id = ? WHERE id = ?", [patch.customerId, accountId]);
  }
  if (patch.subscriptionId !== undefined) {
    await run("UPDATE accounts SET stripe_subscription_id = ? WHERE id = ?", [patch.subscriptionId, accountId]);
  }
}

export async function upsertMember(accountId: string, email: string, role: MemberRole, now = Date.now()): Promise<void> {
  const e = email.trim().toLowerCase();
  await run(
    `INSERT INTO account_members (account_id, email, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (account_id, email) DO UPDATE SET role = excluded.role`,
    [accountId, e, role, now],
  );
}

export async function memberRole(accountId: string, email: string): Promise<MemberRole | null> {
  await ensureAccountsSeeded();
  const e = email.trim().toLowerCase();
  const row = (await query<{ role: string }>("SELECT role FROM account_members WHERE account_id = ? AND email = ?", [accountId, e]))[0];
  if (row?.role === "admin" || row?.role === "family") return row.role;
  // Env lists still open the grandfather household (platform owner / local dev).
  if (accountId === LEGACY_ACCOUNT_ID || (await isOnlyAccount(accountId))) {
    if (env.adminEmails().has(e)) return "admin";
    if (env.familyEmails().has(e)) return "family";
  }
  return null;
}

async function isOnlyAccount(accountId: string): Promise<boolean> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts");
  if (Number(rows[0]?.n ?? 0) !== 1) return false;
  const only = (await query<{ id: string }>("SELECT id FROM accounts LIMIT 1"))[0];
  return only?.id === accountId;
}

/** Accounts this email can open, admins first. */
export async function accountsForEmail(email: string): Promise<AccountMember[]> {
  await ensureAccountsSeeded();
  const e = email.trim().toLowerCase();
  const rows = await query<{ account_id: string; email: string; role: string; created_at: number }>(
    "SELECT account_id, email, role, created_at FROM account_members WHERE email = ? ORDER BY role ASC, created_at ASC",
    [e],
  );
  const members: AccountMember[] = rows
    .filter((r) => r.role === "admin" || r.role === "family")
    .map((r) => ({
      accountId: r.account_id,
      email: r.email,
      role: r.role as MemberRole,
      createdAt: Number(r.created_at),
    }));

  if (members.length === 0) {
    if (env.adminEmails().has(e) || env.familyEmails().has(e)) {
      const legacy = await accountById(LEGACY_ACCOUNT_ID);
      if (legacy) {
        return [
          {
            accountId: legacy.id,
            email: e,
            role: env.adminEmails().has(e) ? "admin" : "family",
            createdAt: legacy.createdAt,
          },
        ];
      }
    }
  }
  return members;
}

export async function canSignIn(email: string): Promise<boolean> {
  return (await accountsForEmail(email)).length > 0;
}
