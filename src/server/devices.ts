import "server-only";

import { randomToken, sha256 } from "./crypto";
import { query, run } from "./db";

// A display (the UC-Display21 in the kitchen, a tablet in the hall). Each one opens its own secret address,
// /d/<token>/, so it can be signed out alone by deleting it. Only the token's hash is stored; the address is shown
// once, when the device is added. A device shows its own view, or follows the time-of-day schedule (view_id null).

export interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
}

type Row = { id: string; name: string; view_id: string | null; created_at: number; last_seen_at: number | null };
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
  const id = randomToken(9);
  const token = randomToken(18);
  await run("INSERT INTO devices (id, name, token_hash, view_id, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    name,
    sha256(token),
    viewId,
    now,
  ]);
  return { device: { id, name, viewId, createdAt: now, lastSeenAt: null }, token };
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

export async function removeDevice(id: string): Promise<boolean> {
  return (await run("DELETE FROM devices WHERE id = ?", [id])) === 1;
}

/** The device a display token belongs to, noting when it was last seen (at most once a minute, to keep writes down). */
export async function deviceForToken(token: string, now = Date.now()): Promise<Device | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rows = await query<Row>("SELECT * FROM devices WHERE token_hash = ?", [sha256(token)]);
  const row = rows[0];
  if (!row) return null;
  if (row.last_seen_at === null || now - Number(row.last_seen_at) > 60_000) {
    await run("UPDATE devices SET last_seen_at = ? WHERE id = ?", [now, row.id]);
  }
  return toDevice(row);
}
