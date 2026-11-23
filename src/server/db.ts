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
  // The meal plan: one row per day and meal (src/server/meals.ts).
  `CREATE TABLE IF NOT EXISTS meals (date TEXT NOT NULL, slot TEXT NOT NULL, text TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (date, slot))`,
  // The chore chart's ticks: one row per day, chore and person (src/server/chores.ts).
  `CREATE TABLE IF NOT EXISTS chores_done (date TEXT NOT NULL, chore_id TEXT NOT NULL, person_id TEXT NOT NULL, stars INTEGER NOT NULL, done_at INTEGER NOT NULL, PRIMARY KEY (date, chore_id, person_id))`,
  // The family shopping list (src/server/shopping.ts): items added from phones, ticked on the wall or phone.
  `CREATE TABLE IF NOT EXISTS shopping (id TEXT PRIMARY KEY, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL, added_at INTEGER NOT NULL, done_at INTEGER, added_by TEXT NOT NULL)`,
  // Family calendar notes posted from phones (src/server/familyEvents.ts); merged into the display calendar feed.
  `CREATE TABLE IF NOT EXISTS family_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, all_day INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL)`,
  // Ids of strip-worthy alerts already emailed (src/server/alertNotify.ts), so a new alert emails once.
  `CREATE TABLE IF NOT EXISTS alert_notified (id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)`,
  // Shared kitchen whiteboard doodle (src/server/whiteboard.ts): one board for every display.
  `CREATE TABLE IF NOT EXISTS whiteboard (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  // Multi-tenant households (Melvin, 2026-11-22). Existing rows are backfilled into acct_legacy on first open.
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_members (account_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (account_id, email))`,
  `CREATE INDEX IF NOT EXISTS account_members_by_email ON account_members (email)`,
  `CREATE TABLE IF NOT EXISTS account_config (account_id TEXT PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_secrets (account_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, key))`,
  // Meal / chore ticks keyed by household (replaces the global composite PKs for new writes).
  `CREATE TABLE IF NOT EXISTS account_meals (account_id TEXT NOT NULL, date TEXT NOT NULL, slot TEXT NOT NULL, text TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (account_id, date, slot))`,
  `CREATE TABLE IF NOT EXISTS account_chores_done (account_id TEXT NOT NULL, date TEXT NOT NULL, chore_id TEXT NOT NULL, person_id TEXT NOT NULL, stars INTEGER NOT NULL, done_at INTEGER NOT NULL, PRIMARY KEY (account_id, date, chore_id, person_id))`,
  // Star rewards redeemed on the wall (src/server/chores.ts); stars_cost is kept in case the reward changes later.
  `CREATE TABLE IF NOT EXISTS chore_redemptions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, person_id TEXT NOT NULL, reward_id TEXT NOT NULL, stars_cost INTEGER NOT NULL, redeemed_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS chore_redemptions_by_week ON chore_redemptions (account_id, person_id, redeemed_at)`,
  `CREATE TABLE IF NOT EXISTS account_alert_notified (account_id TEXT NOT NULL, id TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (account_id, id))`,
  // Phone QR sign-in for displays without an email app (Melvin, 2026-11-23; Tuned-style code + poll).
  `CREATE TABLE IF NOT EXISTS device_sign_ins (
    code_hash TEXT PRIMARY KEY,
    poll_secret_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    email TEXT,
    account_id TEXT,
    role TEXT,
    handoff_hash TEXT,
    handoff_sealed TEXT,
    approved_at INTEGER,
    claimed_at INTEGER
  )`,
  // One Free signup household per email (Melvin, 2026-11-23): stops parallel /api/auth/signup/ creating two accounts.
  `CREATE TABLE IF NOT EXISTS signup_emails (email TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
];

// Columns added after a table was first created. SQLite has no ADD COLUMN IF NOT EXISTS, so each one runs on its own
// and "duplicate column" means it is already there.
const COLUMNS = [
  `ALTER TABLE messages ADD COLUMN posted_by TEXT`,
  // The display's token, encrypted, so an admin can see its address again (Melvin, 2026-11-17).
  `ALTER TABLE devices ADD COLUMN token_sealed TEXT`,
  `ALTER TABLE devices ADD COLUMN account_id TEXT`,
  `ALTER TABLE messages ADD COLUMN account_id TEXT`,
  `ALTER TABLE photos ADD COLUMN account_id TEXT`,
  `ALTER TABLE shopping ADD COLUMN account_id TEXT`,
  `ALTER TABLE family_events ADD COLUMN account_id TEXT`,
  `ALTER TABLE sessions ADD COLUMN account_id TEXT`,
  `ALTER TABLE sign_in_links ADD COLUMN account_id TEXT`,
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
