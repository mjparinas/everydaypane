import "server-only";

import { query, run } from "./db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await query<{ value: string }>("SELECT value FROM admin_settings WHERE key = ?", [key]);
  if (!rows[0]?.value) return fallback;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown, now = Date.now()): Promise<void> {
  await run(
    `INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), now],
  );
}
