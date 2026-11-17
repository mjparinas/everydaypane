import "server-only";

import { decrypt, encrypt } from "./crypto";
import { query, run } from "./db";

// Tokens the admin panel saves (Google refresh token, Amazon session cookie, Home Assistant token). Encrypted at
// rest, never sent to a browser: the admin panel only learns whether each one is set.
export type SecretKey =
  | "google.refreshToken"
  // The scopes Google granted with it (space separated), to know whether Google Photos is allowed.
  | "google.scopes"
  | "amazon.cookie"
  | "amazon.tld"
  | "homeAssistant.token"
  // A Cloudflare Access service token in front of Home Assistant's tunnel.
  | "homeAssistant.accessId"
  | "homeAssistant.accessSecret"
  // A calendar link's address (src/server/ical.ts), one per link.
  | `ical.${string}`;

export async function getSecret(k: SecretKey): Promise<string | null> {
  const rows = await query<{ value: string }>("SELECT value FROM secrets WHERE key = ?", [k]);
  const sealed = rows[0]?.value;
  return sealed ? decrypt(sealed) : null;
}

export async function setSecret(k: SecretKey, value: string | null, now = Date.now()): Promise<void> {
  if (value === null || value === "") {
    await run("DELETE FROM secrets WHERE key = ?", [k]);
    return;
  }
  await run(
    "INSERT INTO secrets (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [k, encrypt(value), now],
  );
}

export async function secretsSet(): Promise<Record<SecretKey, boolean>> {
  const rows = await query<{ key: string }>("SELECT key FROM secrets");
  const set = new Set(rows.map((r) => r.key));
  return {
    "google.refreshToken": set.has("google.refreshToken"),
    "google.scopes": set.has("google.scopes"),
    "amazon.cookie": set.has("amazon.cookie"),
    "amazon.tld": set.has("amazon.tld"),
    "homeAssistant.token": set.has("homeAssistant.token"),
    "homeAssistant.accessId": set.has("homeAssistant.accessId"),
    "homeAssistant.accessSecret": set.has("homeAssistant.accessSecret"),
  };
}
