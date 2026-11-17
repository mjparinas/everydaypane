import "server-only";

import { createClient, type Client, type InArgs, type Row } from "@libsql/client";

import { env } from "./env";

// One libsql database (Turso in production, as in Liftsmith and Gradelings; a local file in development; memory in
// tests). The schema is created on first use and only ever grows: add a CREATE TABLE IF NOT EXISTS to MIGRATIONS or
// an ADD COLUMN to COLUMNS, never edit an old one.

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, view_id TEXT, created_at INTEGER NOT NULL, last_seen_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sign_in_links (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, author TEXT NOT NULL, text TEXT NOT NULL, colour TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
  // Photos kept in our own private Blob store (uploads and Google Photos picks); src/server/library.ts.
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, pathname TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, taken TEXT, origin TEXT NOT NULL, origin_id TEXT, added_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS photos_by_source ON photos (source_id, added_at)`,
];

// Columns added after a table was first created. SQLite has no ADD COLUMN IF NOT EXISTS, so each one runs on its own
// and "duplicate column" means it is already there.
const COLUMNS = [
  `ALTER TABLE messages ADD COLUMN posted_by TEXT`,
  // The display's token, encrypted, so an admin can see its address again (Melvin, 2026-11-17).
  `ALTER TABLE devices ADD COLUMN token_sealed TEXT`,
];

async function migrate(c: Client): Promise<void> {
  await c.batch(MIGRATIONS, "write");
  for (const sql of COLUMNS) {
    try {
      await c.execute(sql);
    } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

function open(): Client {
  const url = env.databaseUrl() || (process.env.VITEST ? ":memory:" : "file:local.db");
  const authToken = env.databaseToken();
  return createClient(authToken ? { url, authToken } : { url });
}

async function db(): Promise<Client> {
  client ??= open();
  ready ??= migrate(client);
  await ready;
  return client;
}

export async function query<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await (await db()).execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function run(sql: string, args: InArgs = []): Promise<number> {
  const r = await (await db()).execute({ sql, args });
  return r.rowsAffected;
}

/**
 * Counts one try against `key` and answers whether it is still within `limit` tries per `windowMs`. One atomic
 * statement, so parallel requests can't all read the same count (Liftsmith's security audit).
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END
     RETURNING count`,
    [key, now, now - windowMs, now - windowMs],
  );
  return Number(rows[0]?.count ?? 1) <= limit;
}

/** Tests only: a fresh in-memory database. */
export function resetForTests(): void {
  client?.close();
  client = null;
  ready = null;
}
