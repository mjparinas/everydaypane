#!/usr/bin/env node
/**
 * One-shot export of Everydaypane household members (+ staff allow-list emails) for Clerk import.
 *
 * Usage (with DATABASE_URL / TURSO_* and ADMIN_EMAILS set):
 *   node scripts/clerk-export-users.mjs > clerk-users.json
 *
 * Then:
 *   npx clerk@latest migrate import ./clerk-users.json --source --dry-run
 *   npx clerk@latest migrate import ./clerk-users.json --source --yes
 *
 * Or create users with the Backend API. Passwords are not exported (magic-link era); users sign in with email codes.
 * Wall display QR unlock is unrelated and is not exported.
 */
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
const db = createClient(authToken ? { url, authToken } : { url });

function list(v) {
  return (v ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

const rows = await db.execute("SELECT DISTINCT email FROM account_members ORDER BY email");
const emails = new Set(rows.rows.map((r) => String(r.email).toLowerCase()));
for (const e of list(process.env.ADMIN_EMAILS)) emails.add(e);
for (const e of list(process.env.SUPPORT_EMAILS)) emails.add(e);
for (const e of list(process.env.FAMILY_EMAILS)) emails.add(e);

const users = [...emails].sort().map((email) => ({
  email_address: [email],
  external_id: email,
  skip_password_checks: true,
  skip_password_requirement: true,
}));

process.stdout.write(`${JSON.stringify({ users }, null, 2)}\n`);
await db.close?.();
