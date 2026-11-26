import "server-only";

import { ensureAccountsSeeded } from "./accounts";
import { decrypt, encrypt } from "./crypto";
import { query, run } from "./db";

// Tokens the admin panel saves (Google refresh token, Amazon session cookie, Home Assistant token). Encrypted at
// rest, never sent to a browser: the admin panel only learns whether each one is set. Scoped per household.

export type SecretKey =
  | "google.refreshToken"
  | "google.scopes"
  | "google.name"
  | "amazon.cookie"
  | "amazon.tld"
  | "homeAssistant.token"
  | "homeAssistant.accessId"
  | "homeAssistant.accessSecret"
  | "spotify.refreshToken"
  | "sonos.refreshToken"
  | "nest.refreshToken"
  | "ecobee.refreshToken"
  | "smartthings.refreshToken"
  // A Govee developer API key (from the Govee Home app), src/server/govee.ts.
  | "govee.apiKey"
  // Philips Hue: the OAuth refresh token, and the bridge's application key made through the cloud (src/server/hue.ts).
  | "hue.refreshToken"
  | "hue.appKey"
  // A LIFX personal access token (cloud.lifx.com › Settings), src/server/lifx.ts.
  | "lifx.token"
  | "tempest.token"
  | "wu.apiKey"
  | "lg.token"
  | "airthings.clientId"
  | "airthings.clientSecret"
  | "ecoflow.accessKey"
  | "ecoflow.secretKey"
  | "unifi.apiKey"
  | "rachio.apiKey"
  // A 17TRACK API key (17track.net › API › Settings) for the Packages widget, src/server/packages.ts.
  | "packages.17track"
  // Blue Riiot has no developer API: the app's own email and password (src/server/blueRiiot.ts).
  | "blueRiiot.email"
  | "blueRiiot.password"
  | "microsoft.refreshToken"
  | "microsoft.scopes"
  | "todoist.refreshToken"
  | "ynab.token"
  | "fitbit.refreshToken"
  | "oura.refreshToken"
  | "oura.accessToken"
  | "slack.token"
  | "trello.token"
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
    "google.name": set.has("google.name"),
    "amazon.cookie": set.has("amazon.cookie"),
    "amazon.tld": set.has("amazon.tld"),
    "homeAssistant.token": set.has("homeAssistant.token"),
    "homeAssistant.accessId": set.has("homeAssistant.accessId"),
    "homeAssistant.accessSecret": set.has("homeAssistant.accessSecret"),
    "spotify.refreshToken": set.has("spotify.refreshToken"),
    "sonos.refreshToken": set.has("sonos.refreshToken"),
    "nest.refreshToken": set.has("nest.refreshToken"),
    "ecobee.refreshToken": set.has("ecobee.refreshToken"),
    "smartthings.refreshToken": set.has("smartthings.refreshToken"),
    "govee.apiKey": set.has("govee.apiKey"),
    "hue.refreshToken": set.has("hue.refreshToken"),
    "hue.appKey": set.has("hue.appKey"),
    "lifx.token": set.has("lifx.token"),
    "tempest.token": set.has("tempest.token"),
    "wu.apiKey": set.has("wu.apiKey"),
    "lg.token": set.has("lg.token"),
    "airthings.clientId": set.has("airthings.clientId"),
    "airthings.clientSecret": set.has("airthings.clientSecret"),
    "ecoflow.accessKey": set.has("ecoflow.accessKey"),
    "ecoflow.secretKey": set.has("ecoflow.secretKey"),
    "unifi.apiKey": set.has("unifi.apiKey"),
    "rachio.apiKey": set.has("rachio.apiKey"),
    "packages.17track": set.has("packages.17track"),
    "blueRiiot.email": set.has("blueRiiot.email"),
    "blueRiiot.password": set.has("blueRiiot.password"),
    "microsoft.refreshToken": set.has("microsoft.refreshToken"),
    "microsoft.scopes": set.has("microsoft.scopes"),
    "todoist.refreshToken": set.has("todoist.refreshToken"),
    "ynab.token": set.has("ynab.token"),
    "fitbit.refreshToken": set.has("fitbit.refreshToken"),
    "oura.refreshToken": set.has("oura.refreshToken"),
    "oura.accessToken": set.has("oura.accessToken"),
    "slack.token": set.has("slack.token"),
    "trello.token": set.has("trello.token"),
    "dropbox.refreshToken": set.has("dropbox.refreshToken"),
    "box.refreshToken": set.has("box.refreshToken"),
    "flickr.refreshToken": set.has("flickr.refreshToken"),
    "smugmug.refreshToken": set.has("smugmug.refreshToken"),
    "chores.pin": set.has("chores.pin"),
  };
}
