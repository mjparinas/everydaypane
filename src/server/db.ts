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
  // One whiteboard per household (2026-11-26, when phones started drawing on it). The single-row table above was
  // shared by every household; its doodle is carried over to the grandfather household on first read.
  `CREATE TABLE IF NOT EXISTS account_whiteboard (account_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  // Multi-tenant households (Melvin, 2026-11-22). Existing rows are backfilled into acct_legacy on first open.
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_members (account_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (account_id, email))`,
  `CREATE INDEX IF NOT EXISTS account_members_by_email ON account_members (email)`,
  `CREATE TABLE IF NOT EXISTS account_config (account_id TEXT PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_secrets (account_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, key))`,
  // Meal / chore ticks keyed by household (replaces the global composite PKs for new writes).
  `CREATE TABLE IF NOT EXISTS account_meals (account_id TEXT NOT NULL, date TEXT NOT NULL, slot TEXT NOT NULL, text TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (account_id, date, slot))`,
  // Recurring meal rules (Melvin, 2026-11-23): expand into the plan at read time; one-offs override or skip a day.
  `CREATE TABLE IF NOT EXISTS account_meal_rules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    text TEXT NOT NULL,
    kind TEXT NOT NULL,
    days TEXT,
    every_n INTEGER,
    start_date TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS account_meal_rules_by_account ON account_meal_rules (account_id)`,
  `CREATE TABLE IF NOT EXISTS account_chores_done (account_id TEXT NOT NULL, date TEXT NOT NULL, chore_id TEXT NOT NULL, person_id TEXT NOT NULL, stars INTEGER NOT NULL, done_at INTEGER NOT NULL, PRIMARY KEY (account_id, date, chore_id, person_id))`,
  // Star rewards redeemed on the wall (src/server/chores.ts); stars_cost is kept in case the reward changes later.
  `CREATE TABLE IF NOT EXISTS chore_redemptions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, person_id TEXT NOT NULL, reward_id TEXT NOT NULL, stars_cost INTEGER NOT NULL, redeemed_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS chore_redemptions_by_week ON chore_redemptions (account_id, person_id, redeemed_at)`,
  // Message pop-ups per screen (Melvin, 2026-11-26: "if i refresh the page they should not go away … dismissed message
  // on one screen, shouldnt impact the other"): where each display started reading the board, and what it dismissed.
  `CREATE TABLE IF NOT EXISTS display_popups (account_id TEXT NOT NULL, device_id TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY (account_id, device_id))`,
  `CREATE TABLE IF NOT EXISTS display_popup_dismissed (account_id TEXT NOT NULL, device_id TEXT NOT NULL, message_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account_id, device_id, message_id))`,
  `CREATE TABLE IF NOT EXISTS account_alert_notified (account_id TEXT NOT NULL, id TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (account_id, id))`,
  // Phone QR unlock for a wall display (Melvin, 2026-11-23; Tuned-style code + poll). Approver picks a device_id.
  `CREATE TABLE IF NOT EXISTS device_sign_ins (
    code_hash TEXT PRIMARY KEY,
    poll_secret_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    email TEXT,
    account_id TEXT,
    role TEXT,
    device_id TEXT,
    handoff_hash TEXT,
    handoff_sealed TEXT,
    approved_at INTEGER,
    claimed_at INTEGER
  )`,
  // One Free signup household per email (Melvin, 2026-11-23). The webhook still writes here; the old signup route is gone.
  `CREATE TABLE IF NOT EXISTS signup_emails (email TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  // Leftover staff magic-link and TOTP tables (Melvin, 2026-11-25: login is Clerk). Kept; migrations only add.
  `CREATE TABLE IF NOT EXISTS admin_links (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_two_factor (email TEXT PRIMARY KEY, secret TEXT, pending TEXT, enabled_at INTEGER, last_step INTEGER)`,
  `CREATE TABLE IF NOT EXISTS admin_backup_codes (email TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, PRIMARY KEY (email, code_hash))`,
  `CREATE TABLE IF NOT EXISTS admin_session_steps (token_hash TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT)`,
  `CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_tasks (id TEXT PRIMARY KEY, text TEXT NOT NULL, due_at INTEGER, done_at INTEGER, created_at INTEGER NOT NULL, created_by TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_todo_hidden (key TEXT PRIMARY KEY, until_at INTEGER, dismissed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS account_notes (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, admin TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS account_notes_by_account ON account_notes (account_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS problem_reports (id TEXT PRIMARY KEY, account_id TEXT, email TEXT, text TEXT NOT NULL, status TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS problem_reports_by_status ON problem_reports (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS feature_flags (name TEXT PRIMARY KEY, value TEXT NOT NULL, share INTEGER NOT NULL DEFAULT 100, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS promo_codes (code TEXT PRIMARY KEY, kind TEXT NOT NULL, max_uses INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, note TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS promo_redemptions (id TEXT PRIMARY KEY, code TEXT NOT NULL, account_id TEXT NOT NULL, redeemed_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS promo_redemptions_by_code ON promo_redemptions (code)`,
  `CREATE TABLE IF NOT EXISTS page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, visitor TEXT NOT NULL, path TEXT NOT NULL, referrer TEXT, utm_source TEXT, utm_campaign TEXT, country TEXT, browser TEXT, os TEXT, device TEXT, track TEXT, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS page_views_by_day ON page_views (day, at)`,
  `CREATE TABLE IF NOT EXISTS admin_events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, props TEXT, at INTEGER NOT NULL, account_id TEXT, device_id TEXT)`,
  `CREATE INDEX IF NOT EXISTS admin_events_by_name ON admin_events (name, at)`,
  // Washer and dryer cycles, so a run that stops reads as done until the next one (src/server/laundry.ts).
  `CREATE TABLE IF NOT EXISTS laundry_state (account_id TEXT NOT NULL, id TEXT NOT NULL, running INTEGER NOT NULL, ends_at INTEGER, done_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, id))`,
  `CREATE TABLE IF NOT EXISTS staff_sign_in_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`,
  // Getting-started emails (src/server/onboarding.ts): each one claimed before it's sent, so it goes out once.
  `CREATE TABLE IF NOT EXISTS onboarding_sends (account_id TEXT NOT NULL, email TEXT NOT NULL, step TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (account_id, email, step))`,
  // Addresses that unsubscribed from a kind of email from its link (`onboarding` for now).
  `CREATE TABLE IF NOT EXISTS email_optouts (email TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (email, kind))`,
  `CREATE INDEX IF NOT EXISTS accounts_by_created ON accounts (created_at)`,
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
  `ALTER TABLE devices ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`,
  // Wall unlock via phone QR picks which display (Melvin, 2026-11-23).
  `ALTER TABLE device_sign_ins ADD COLUMN device_id TEXT`,
  // Who added a library photo from a phone (photo frame polish, 2026-11-26), so they can take back their own.
  `ALTER TABLE photos ADD COLUMN added_by TEXT`,
  // Shopping aisles and "running low" (Melvin, 2026-11-26). A null category is guessed from the words when read.
  `ALTER TABLE shopping ADD COLUMN category TEXT`,
  `ALTER TABLE shopping ADD COLUMN low INTEGER NOT NULL DEFAULT 0`,
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

/** Several statements as one write (admin 2FA enrolment and similar). */
export async function batch(stmts: { sql: string; args?: InArgs }[]): Promise<void> {
  const c = await db();
  await c.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
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
