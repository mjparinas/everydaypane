import "server-only";

import { query } from "./db";

export async function listAudit(opts: { before?: number; who?: string; what?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 100, 200);
  const before = opts.before ?? Number.MAX_SAFE_INTEGER;
  const who = opts.who?.trim().toLowerCase();
  const what = opts.what?.trim();
  let sql = "SELECT id, at, admin, action, target, detail FROM admin_audit WHERE id < ?";
  const args: (string | number)[] = [before];
  if (who) {
    sql += " AND admin = ?";
    args.push(who);
  }
  if (what) {
    sql += " AND action LIKE ?";
    args.push(`${what}%`);
  }
  sql += " ORDER BY id DESC LIMIT ?";
  args.push(limit);
  const rows = await query<{ id: number; at: number; admin: string; action: string; target: string | null; detail: string | null }>(
    sql,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: Number(r.at),
    admin: r.admin,
    action: r.action,
    target: r.target,
    detail: r.detail,
  }));
}
