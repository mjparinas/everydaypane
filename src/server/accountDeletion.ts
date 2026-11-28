import "server-only";

import { del } from "@vercel/blob";

import { accountById, LEGACY_ACCOUNT_ID } from "./accounts";
import { stripe } from "./billing";
import { query, run } from "./db";
import { env } from "./env";

// Delete Account (Melvin, 2026-11-28: "go", for App Store guideline 5.1.1(v): an app that lets people make an
// account must let them delete it inside the app). It works the same on the website. Deleting removes the person
// from every household they belong to; a household where they are the only admin goes with them, with everything in
// it (settings, secrets, displays, lists, photos) and its Household plan cancelled at Stripe first, so nobody is
// charged for a household that no longer exists. Households with another admin keep going without them. Claude's
// calls: the grandfather household and the people on ADMIN_EMAILS / FAMILY_EMAILS (who'd be put straight back by
// the env bootstrap) can't be deleted here, and the page shows exactly what will go before the second tap.

export interface DeletionPlan {
  /** Households deleted outright: the person is their only admin. */
  deleteHouseholds: { id: string; name: string; paid: boolean }[];
  /** Households the person only leaves. */
  leaveHouseholds: { id: string; name: string }[];
  /** Why it can't be done here, when it can't. */
  blocked: "staff" | null;
}

export async function deletionPlan(email: string): Promise<DeletionPlan> {
  const e = email.trim().toLowerCase();
  const memberships = await query<{ account_id: string; role: string }>("SELECT account_id, role FROM account_members WHERE email = ?", [
    e,
  ]);
  const plan: DeletionPlan = { deleteHouseholds: [], leaveHouseholds: [], blocked: null };
  if (env.adminEmails().has(e) || env.familyEmails().has(e)) plan.blocked = "staff";
  for (const m of memberships) {
    const account = await accountById(m.account_id);
    if (!account) continue;
    if (account.id === LEGACY_ACCOUNT_ID) plan.blocked = "staff";
    const otherAdmins = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM account_members WHERE account_id = ? AND role = 'admin' AND email <> ?",
      [account.id, e],
    );
    if (m.role === "admin" && Number(otherAdmins[0]?.n ?? 0) === 0)
      plan.deleteHouseholds.push({ id: account.id, name: account.name, paid: Boolean(account.stripeSubscriptionId) });
    else plan.leaveHouseholds.push({ id: account.id, name: account.name });
  }
  return plan;
}

export type DeletionResult = { ok: true; plan: DeletionPlan } | { ok: false; error: "staff" | "billing" };

/** Deletes the person's Everydaypane data as `deletionPlan` describes. The caller deletes the Clerk user after. */
export async function deleteAccount(email: string): Promise<DeletionResult> {
  const e = email.trim().toLowerCase();
  const plan = await deletionPlan(e);
  if (plan.blocked) return { ok: false, error: plan.blocked };

  // Cancel every plan first: if Stripe refuses, nothing has been deleted yet and the person can try again.
  for (const h of plan.deleteHouseholds) {
    const account = await accountById(h.id);
    if (!account?.stripeSubscriptionId || !env.stripeSecretKey()) continue;
    try {
      await stripe().subscriptions.cancel(account.stripeSubscriptionId);
    } catch (err) {
      // Already cancelled is fine; anything else stops the deletion.
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") return { ok: false, error: "billing" };
    }
  }

  for (const h of plan.deleteHouseholds) await deleteHousehold(h.id);
  for (const h of plan.leaveHouseholds) {
    await run("DELETE FROM account_members WHERE account_id = ? AND email = ?", [h.id, e]);
    await run("DELETE FROM mobile_devices WHERE account_id = ? AND email = ?", [h.id, e]);
    await run("DELETE FROM onboarding_sends WHERE account_id = ? AND email = ?", [h.id, e]);
  }
  // Their own trail outside any one household. Opt-outs stay, so a new account at the address isn't mailed again.
  await run("DELETE FROM signup_emails WHERE email = ?", [e]);
  await run("DELETE FROM mobile_devices WHERE email = ?", [e]);
  await run("UPDATE messages SET posted_by = NULL WHERE posted_by = ?", [e]);
  await run("UPDATE photos SET added_by = NULL WHERE added_by = ?", [e]);
  return { ok: true, plan };
}

/**
 * Every row of a household, in every table with an `account_id` column (found from the schema, so a table added
 * later is covered with no change here), its library photos in Blob, and the account row itself.
 */
export async function deleteHousehold(accountId: string): Promise<void> {
  if (accountId === LEGACY_ACCOUNT_ID) throw new Error("The grandfather household can't be deleted");
  const photos = await query<{ pathname: string }>("SELECT pathname FROM photos WHERE account_id = ?", [accountId]);
  if (photos.length && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
    for (let i = 0; i < photos.length; i += 100) await del(photos.slice(i, i + 100).map((p) => p.pathname));
  }
  for (const table of await householdTables()) await run(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
  await run("DELETE FROM accounts WHERE id = ?", [accountId]);
}

async function householdTables(): Promise<string[]> {
  const tables = await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  const out: string[] = [];
  for (const { name } of tables) {
    if (!/^[a-z_]+$/.test(name)) continue;
    const cols = await query<{ name: string }>(`PRAGMA table_info(${name})`);
    if (cols.some((c) => c.name === "account_id")) out.push(name);
  }
  return out;
}
