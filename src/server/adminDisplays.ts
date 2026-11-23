import "server-only";

import { query, run } from "./db";

export type StaffDisplay = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  createdAt: number;
  lastSeenAt: number | null;
  isTest: boolean;
  viewId: string | null;
};

export async function listDisplaysForStaff(
  opts: { q?: string; tests?: boolean; limit?: number; before?: number } = {},
): Promise<StaffDisplay[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const before = opts.before ?? Number.MAX_SAFE_INTEGER;
  const rows = await query<{
    id: string;
    name: string;
    account_id: string | null;
    account_name: string | null;
    created_at: number;
    last_seen_at: number | null;
    is_test: number;
    view_id: string | null;
  }>(
    `SELECT d.id, d.name, d.account_id, a.name AS account_name, d.created_at, d.last_seen_at, d.is_test, d.view_id
     FROM devices d
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.created_at < ?
     ORDER BY d.created_at DESC
     LIMIT ?`,
    [before, limit * 4],
  );
  let list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    accountId: r.account_id ?? "",
    accountName: r.account_name ?? "—",
    createdAt: Number(r.created_at),
    lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
    isTest: Boolean(r.is_test),
    viewId: r.view_id,
  }));
  if (!opts.tests) list = list.filter((d) => !d.isTest);
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.accountId.toLowerCase().includes(q) ||
        d.accountName.toLowerCase().includes(q),
    );
  }
  return list.slice(0, limit);
}

export async function setDisplayTest(id: string, isTest: boolean): Promise<boolean> {
  return (await run("UPDATE devices SET is_test = ? WHERE id = ?", [isTest ? 1 : 0, id])) === 1;
}

export async function displayDetail(id: string) {
  const rows = await query<{
    id: string;
    name: string;
    account_id: string | null;
    account_name: string | null;
    created_at: number;
    last_seen_at: number | null;
    is_test: number;
    view_id: string | null;
  }>(
    `SELECT d.id, d.name, d.account_id, a.name AS account_name, d.created_at, d.last_seen_at, d.is_test, d.view_id
     FROM devices d LEFT JOIN accounts a ON a.id = d.account_id WHERE d.id = ?`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    accountId: r.account_id ?? "",
    accountName: r.account_name ?? "—",
    createdAt: Number(r.created_at),
    lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
    isTest: Boolean(r.is_test),
    viewId: r.view_id,
  };
}
