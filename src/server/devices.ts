import "server-only";

import { ensureAccountsSeeded } from "./accounts";
import { decrypt, encrypt, randomAlphanumeric, randomToken, sha256 } from "./crypto";
import { query, run } from "./db";

// A display (kitchen wall panel, a tablet in the hall). The wall opens `/display/` and unlocks with a household
// member's phone QR (or a signed-in picker); the device token stays sealed and is injected as `data-token` after unlock
// (Melvin, 2026-11-23). Edit/chores still use `/d/<token>/…`. Displays are found by the token's hash; the token itself
// is also kept encrypted so the Displays tab can show phone-edit addresses. A device shows its own view, or follows the
// time-of-day schedule (view_id null). Each device belongs to one household.

export interface Device {
  id: string;
  accountId: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
}

/** A listed display plus its token when we still have it sealed (null for very old rows). */
export type DeviceWithToken = Device & { token: string | null };

type Row = {
  id: string;
  account_id: string | null;
  name: string;
  view_id: string | null;
  created_at: number;
  last_seen_at: number | null;
  token_sealed?: string | null;
};
const DISPLAY_TOKEN_LENGTH = 8;
const TOKEN_ATTEMPTS = 10;

const newDisplayToken = () => randomAlphanumeric(DISPLAY_TOKEN_LENGTH);

const toDevice = (r: Row): Device => ({
  id: r.id,
  accountId: r.account_id ?? "",
  name: r.name,
  viewId: r.view_id,
  createdAt: Number(r.created_at),
  lastSeenAt: r.last_seen_at === null ? null : Number(r.last_seen_at),
});

export async function listDevices(accountId: string): Promise<DeviceWithToken[]> {
  await ensureAccountsSeeded();
  return (await query<Row>("SELECT * FROM devices WHERE account_id = ? ORDER BY created_at", [accountId])).map((r) => ({
    ...toDevice(r),
    token: r.token_sealed ? decrypt(r.token_sealed) : null,
  }));
}

export async function countDevices(accountId: string): Promise<number> {
  await ensureAccountsSeeded();
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE account_id = ?", [accountId]);
  return Number(rows[0]?.n ?? 0);
}

export async function addDevice(
  accountId: string,
  name: string,
  viewId: string | null,
  now = Date.now(),
): Promise<{ device: Device; token: string }> {
  await ensureAccountsSeeded();
  for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
    const id = randomToken(9);
    const token = newDisplayToken();
    const inserted = await run(
      "INSERT OR IGNORE INTO devices (id, account_id, name, token_hash, token_sealed, view_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, accountId, name, sha256(token), encrypt(token), viewId, now],
    );
    if (inserted === 1) return { device: { id, accountId, name, viewId, createdAt: now, lastSeenAt: null }, token };
  }
  throw new Error("Could not generate a unique display address");
}

export async function updateDevice(accountId: string, id: string, patch: { name?: string; viewId?: string | null }): Promise<boolean> {
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.viewId !== undefined) {
    sets.push("view_id = ?");
    args.push(patch.viewId);
  }
  if (sets.length === 0) return true;
  return (await run(`UPDATE devices SET ${sets.join(", ")} WHERE id = ? AND account_id = ?`, [...args, id, accountId])) === 1;
}

/**
 * The display's token, for building its address. Null for a device added before tokens were kept, or one that doesn't
 * exist.
 */
export async function deviceToken(accountId: string, id: string): Promise<string | null> {
  const row = (
    await query<{ token_sealed: string | null }>("SELECT token_sealed FROM devices WHERE id = ? AND account_id = ?", [id, accountId])
  )[0];
  return row?.token_sealed ? decrypt(row.token_sealed) : null;
}

/** Device row for an account (no token). */
export async function deviceForAccount(accountId: string, id: string): Promise<Device | null> {
  await ensureAccountsSeeded();
  const row = (await query<Row>("SELECT * FROM devices WHERE id = ? AND account_id = ?", [id, accountId]))[0];
  return row?.account_id ? toDevice(row) : null;
}

/** Names only for the unlock picker (phone or signed-in wall). */
export async function listDeviceNames(accountId: string): Promise<{ id: string; name: string }[]> {
  return (await listDevices(accountId)).map((d) => ({ id: d.id, name: d.name }));
}

/** Raw token for a known hash (wall cookie → `data-token`). */
export async function tokenForTokenHash(tokenHash: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const row = (await query<{ token_sealed: string | null }>("SELECT token_sealed FROM devices WHERE token_hash = ?", [tokenHash]))[0];
  return row?.token_sealed ? decrypt(row.token_sealed) : null;
}

export async function newDeviceToken(accountId: string, id: string): Promise<string | null> {
  const row = (await query<{ token_hash: string }>("SELECT token_hash FROM devices WHERE id = ? AND account_id = ?", [id, accountId]))[0];
  if (!row) return null;

  for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
    const token = newDisplayToken();
    const hash = sha256(token);
    if (hash === row.token_hash) continue;
    const changed = await run("UPDATE OR IGNORE devices SET token_hash = ?, token_sealed = ? WHERE id = ? AND account_id = ?", [
      hash,
      encrypt(token),
      id,
      accountId,
    ]);
    if (changed === 1) return token;
  }
  throw new Error("Could not generate a unique display address");
}

export async function removeDevice(accountId: string, id: string): Promise<boolean> {
  return (await run("DELETE FROM devices WHERE id = ? AND account_id = ?", [id, accountId])) === 1;
}

export async function deviceForToken(token: string, now = Date.now()): Promise<Device | null> {
  if (!/^(?:[A-Za-z0-9]{8}|[A-Za-z0-9]{10}|[A-Za-z0-9_-]{16,64})$/.test(token)) return null;
  return deviceForTokenHash(sha256(token), now);
}

export async function deviceForTokenHash(tokenHash: string, now = Date.now()): Promise<Device | null> {
  await ensureAccountsSeeded();
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const rows = await query<Row>("SELECT * FROM devices WHERE token_hash = ?", [tokenHash]);
  const row = rows[0];
  if (!row?.account_id) return null;
  if (row.last_seen_at === null || now - Number(row.last_seen_at) > 60_000) {
    await run("UPDATE devices SET last_seen_at = ? WHERE id = ?", [now, row.id]);
  }
  return toDevice(row);
}
