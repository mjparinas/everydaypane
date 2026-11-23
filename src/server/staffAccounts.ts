import "server-only";

import { ensureAccountsSeeded, type Account } from "./accounts";
import { query } from "./db";

export type StaffHousehold = Account & {
  members: { email: string; role: string }[];
  deviceCount: number;
};

type AccountRow = {
  id: string;
  name: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: number;
};

/** Every household for the platform admin panel (newest first). */
export async function listHouseholdsForStaff(): Promise<StaffHousehold[]> {
  await ensureAccountsSeeded();
  const accounts = await query<AccountRow>("SELECT * FROM accounts ORDER BY created_at DESC");
  if (!accounts.length) return [];

  const members = await query<{ account_id: string; email: string; role: string }>(
    "SELECT account_id, email, role FROM account_members ORDER BY role ASC, email ASC",
  );
  const devices = await query<{ account_id: string; n: number }>(
    "SELECT account_id, COUNT(*) AS n FROM devices WHERE account_id IS NOT NULL AND account_id != '' GROUP BY account_id",
  );
  const deviceBy = new Map(devices.map((d) => [d.account_id, Number(d.n)]));
  const membersBy = new Map<string, { email: string; role: string }[]>();
  for (const m of members) {
    const list = membersBy.get(m.account_id) ?? [];
    list.push({ email: m.email, role: m.role });
    membersBy.set(m.account_id, list);
  }

  return accounts.map((r) => ({
    id: r.id,
    name: r.name,
    plan: r.plan === "paid" ? "paid" : "free",
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    createdAt: Number(r.created_at),
    members: membersBy.get(r.id) ?? [],
    deviceCount: deviceBy.get(r.id) ?? 0,
  }));
}
