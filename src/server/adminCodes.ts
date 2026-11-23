import "server-only";

import { setAccountPlan } from "./accounts";
import { randomAlphanumeric } from "./crypto";
import { query, run } from "./db";

export async function listCodes() {
  const rows = await query<{
    code: string;
    kind: string;
    max_uses: number;
    used: number;
    expires_at: number | null;
    note: string | null;
    enabled: number;
    created_at: number;
  }>("SELECT * FROM promo_codes ORDER BY created_at DESC");
  return rows.map((r) => ({
    code: r.code,
    kind: r.kind,
    maxUses: Number(r.max_uses),
    used: Number(r.used),
    expiresAt: r.expires_at == null ? null : Number(r.expires_at),
    note: r.note,
    enabled: Boolean(r.enabled),
    createdAt: Number(r.created_at),
  }));
}

export async function createCode(
  opts: { code?: string; kind: string; maxUses: number; expiresAt: number | null; note: string | null },
  now = Date.now(),
) {
  const code = (opts.code?.trim().toUpperCase() || `PANE-${randomAlphanumeric(4)}-${randomAlphanumeric(4)}`).replace(/\s/g, "");
  if (!["household", "household_lifetime"].includes(opts.kind)) throw new Error("Bad kind");
  await run("INSERT INTO promo_codes (code, kind, max_uses, used, expires_at, note, enabled, created_at) VALUES (?, ?, ?, 0, ?, ?, 1, ?)", [
    code,
    opts.kind,
    Math.max(1, opts.maxUses),
    opts.expiresAt,
    opts.note,
    now,
  ]);
  return code;
}

export async function setCodeEnabled(code: string, enabled: boolean) {
  return (await run("UPDATE promo_codes SET enabled = ? WHERE code = ?", [enabled ? 1 : 0, code])) === 1;
}

export async function redeemCode(code: string, accountId: string, now = Date.now()) {
  const rows = await query<{
    code: string;
    kind: string;
    max_uses: number;
    used: number;
    expires_at: number | null;
    enabled: number;
  }>("SELECT * FROM promo_codes WHERE code = ?", [code.trim().toUpperCase()]);
  const row = rows[0];
  if (!row || !row.enabled) throw new Error("Code not found");
  if (row.expires_at != null && Number(row.expires_at) < now) throw new Error("Code expired");
  if (Number(row.used) >= Number(row.max_uses)) throw new Error("Code used up");
  const already = await query("SELECT id FROM promo_redemptions WHERE code = ? AND account_id = ?", [row.code, accountId]);
  if (already.length) throw new Error("Already redeemed");
  const claimed = await run("UPDATE promo_codes SET used = used + 1 WHERE code = ? AND used < max_uses AND enabled = 1", [row.code]);
  if (!claimed) throw new Error("Code used up");
  await run("INSERT INTO promo_redemptions (id, code, account_id, redeemed_at) VALUES (?, ?, ?, ?)", [
    `rdm_${now}`,
    row.code,
    accountId,
    now,
  ]);
  await setAccountPlan(accountId, "paid");
  return row.kind;
}
