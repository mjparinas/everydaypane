import "server-only";

import { ensureAccountsSeeded } from "./accounts";
import { decrypt, encrypt } from "./crypto";
import { query, run } from "./db";

// Tokens the admin panel saves (Google refresh token, Amazon session cookie, Home Assistant token). Encrypted at
// rest, never sent to a browser: the admin panel only learns whether each one is set. Scoped per household.

export type SecretKey =
  | "google.refreshToken"
  | "google.scopes"
  | "amazon.cookie"
  | "amazon.tld"
  | "homeAssistant.token"
  | "homeAssistant.accessId"
  | "homeAssistant.accessSecret"
  | "spotify.refreshToken"
  | "sonos.refreshToken"
  | "microsoft.refreshToken"
  | "microsoft.scopes"
  | "todoist.refreshToken"
  | "dropbox.refreshToken"
  | "box.refreshToken"
  | "flickr.refreshToken"
  | "smugmug.refreshToken"
  | "chores.pin"
  | `ical.${string}`
  | `immich.${string}`;

export async function getSecret(accountId: string, k: SecretKey): Promise<string | null> {
  await ensureAccountsSeeded();
  const rows = await query<{ value: string }>("SELECT value FROM account_secrets WHERE account_id = ? AND key = ?", [accountId, k]);
  const sealed = rows[0]?.value;
  return sealed ? decrypt(sealed) : null;
}

export async function setSecret(accountId: string, k: SecretKey, value: string | null, now = Date.now()): Promise<void> {
  await ensureAccountsSeeded();
  if (value === null || value === "") {
    await run("DELETE FROM account_secrets WHERE account_id = ? AND key = ?", [accountId, k]);
    return;
  }
  await run(
    `INSERT INTO account_secrets (account_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (account_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [accountId, k, encrypt(value), now],
  );
}

export async function secretsSet(accountId: string): Promise<Record<SecretKey, boolean>> {
  await ensureAccountsSeeded();
  const rows = await query<{ key: string }>("SELECT key FROM account_secrets WHERE account_id = ?", [accountId]);
  const set = new Set(rows.map((r) => r.key));
  return {
    "google.refreshToken": set.has("google.refreshToken"),
    "google.scopes": set.has("google.scopes"),
    "amazon.cookie": set.has("amazon.cookie"),
    "amazon.tld": set.has("amazon.tld"),
    "homeAssistant.token": set.has("homeAssistant.token"),
    "homeAssistant.accessId": set.has("homeAssistant.accessId"),
    "homeAssistant.accessSecret": set.has("homeAssistant.accessSecret"),
    "spotify.refreshToken": set.has("spotify.refreshToken"),
    "sonos.refreshToken": set.has("sonos.refreshToken"),
    "microsoft.refreshToken": set.has("microsoft.refreshToken"),
    "microsoft.scopes": set.has("microsoft.scopes"),
    "todoist.refreshToken": set.has("todoist.refreshToken"),
    "dropbox.refreshToken": set.has("dropbox.refreshToken"),
    "box.refreshToken": set.has("box.refreshToken"),
    "flickr.refreshToken": set.has("flickr.refreshToken"),
    "smugmug.refreshToken": set.has("smugmug.refreshToken"),
    "chores.pin": set.has("chores.pin"),
  };
}
