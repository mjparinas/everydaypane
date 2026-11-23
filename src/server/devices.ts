import "server-only";

import { decrypt, encrypt, randomAlphanumeric, randomToken, sha256 } from "./crypto";
import { query, run } from "./db";

// A display (the UC-Display21 in the kitchen, a tablet in the hall). Each one opens its own secret address,
// /d/<token>/, so it can be signed out alone by deleting it or giving it a new link. Displays are found by the token's
// hash; the token itself is also kept encrypted (like the other stored secrets) so a signed-in admin can see and copy
// the address again any time (Melvin, 2026-11-17: the address shouldn't be shown only once). A device shows its own
// view, or follows the time-of-day schedule (view_id null).

export interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
}

type Row = { id: string; name: string; view_id: string | null; created_at: number; last_seen_at: number | null };
const DISPLAY_TOKEN_LENGTH = 8;
const TOKEN_ATTEMPTS = 10;

const newDisplayToken = () => randomAlphanumeric(DISPLAY_TOKEN_LENGTH);

const toDevice = (r: Row): Device => ({
  id: r.id,
  name: r.name,
  viewId: r.view_id,
  createdAt: Number(r.created_at),
  lastSeenAt: r.last_seen_at === null ? null : Number(r.last_seen_at),
});

export async function listDevices(): Promise<Device[]> {
  return (await query<Row>("SELECT * FROM devices ORDER BY created_at")).map(toDevice);
}

export async function addDevice(name: string, viewId: string | null, now = Date.now()): Promise<{ device: Device; token: string }> {
  for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
    const id = randomToken(9);
    const token = newDisplayToken();
    // The UNIQUE token_hash constraint makes this collision check atomic across all app instances.
    const inserted = await run(
      "INSERT OR IGNORE INTO devices (id, name, token_hash, token_sealed, view_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, sha256(token), encrypt(token), viewId, now],
    );
    if (inserted === 1) return { device: { id, name, viewId, createdAt: now, lastSeenAt: null }, token };
  }
  throw new Error("Could not generate a unique display address");
}

export async function updateDevice(id: string, patch: { name?: string; viewId?: string | null }): Promise<boolean> {
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
  return (await run(`UPDATE devices SET ${sets.join(", ")} WHERE id = ?`, [...args, id])) === 1;
}

/**
 * The display's token, for showing its address to an admin again. Null for a device added before tokens were kept
 * (only a new link can show one) or one that doesn't exist.
 */
export async function deviceToken(id: string): Promise<string | null> {
  const row = (await query<{ token_sealed: string | null }>("SELECT token_sealed FROM devices WHERE id = ?", [id]))[0];
  return row?.token_sealed ? decrypt(row.token_sealed) : null;
}

/** Gives a display a new address. The old one stops working at once, so a leaked link can be shut off. */
export async function newDeviceToken(id: string): Promise<string | null> {
  const row = (await query<{ token_hash: string }>("SELECT token_hash FROM devices WHERE id = ?", [id]))[0];
  if (!row) return null;

  for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
    const token = newDisplayToken();
    const hash = sha256(token);
    if (hash === row.token_hash) continue;
    // A collision with another display is ignored by SQLite, then retried with a fresh code.
    const changed = await run("UPDATE OR IGNORE devices SET token_hash = ?, token_sealed = ? WHERE id = ?", [hash, encrypt(token), id]);
    if (changed === 1) return token;
  }
  throw new Error("Could not generate a unique display address");
}

export async function removeDevice(id: string): Promise<boolean> {
  return (await run("DELETE FROM devices WHERE id = ?", [id])) === 1;
}

/** The device a display token belongs to, noting when it was last seen (at most once a minute, to keep writes down). */
export async function deviceForToken(token: string, now = Date.now()): Promise<Device | null> {
  // New links are exactly 8 alphanumerics; keep accepting the earlier 10-character and legacy base64url links.
  if (!/^(?:[A-Za-z0-9]{8}|[A-Za-z0-9]{10}|[A-Za-z0-9_-]{16,64})$/.test(token)) return null;
  return deviceForTokenHash(sha256(token), now);
}

/** Lookup by the token's SHA-256 (used by the short-lived display cookie for image routes). */
export async function deviceForTokenHash(tokenHash: string, now = Date.now()): Promise<Device | null> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const rows = await query<Row>("SELECT * FROM devices WHERE token_hash = ?", [tokenHash]);
  const row = rows[0];
  if (!row) return null;
  if (row.last_seen_at === null || now - Number(row.last_seen_at) > 60_000) {
    await run("UPDATE devices SET last_seen_at = ? WHERE id = ?", [now, row.id]);
  }
  return toDevice(row);
}
