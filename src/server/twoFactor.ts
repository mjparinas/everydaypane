import "server-only";

import { batch, query, rateLimit, run } from "./db";
import { env } from "./env";
import { hashBackupCode, looksLikeBackupCode, newBackupCodes, newSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "./totp";

export function twoFactorMode(): "required" | "optional" {
  return env.admin2fa();
}

export interface TwoFactorState {
  enabled: boolean;
  enabledAt: number | null;
  backupCodesLeft: number;
}

export async function twoFactorState(email: string): Promise<TwoFactorState> {
  const rows = await query<{ enabled_at: number | null }>("SELECT enabled_at FROM admin_two_factor WHERE email = ?", [email]);
  const enabledAt = rows[0]?.enabled_at == null ? null : Number(rows[0].enabled_at);
  if (enabledAt == null) return { enabled: false, enabledAt: null, backupCodesLeft: 0 };
  const left = await query<{ n: number }>("SELECT COUNT(*) AS n FROM admin_backup_codes WHERE email = ? AND used_at IS NULL", [email]);
  return { enabled: true, enabledAt, backupCodesLeft: Number(left[0]?.n ?? 0) };
}

export const passedSecondStep = (enabled: boolean, stepAt: number | null) => (enabled ? stepAt != null : twoFactorMode() === "optional");

export async function startEnrolment(email: string, restart = false): Promise<{ secret: string; uri: string }> {
  if (!restart) {
    const rows = await query<{ pending: string | null }>("SELECT pending FROM admin_two_factor WHERE email = ? AND enabled_at IS NULL", [
      email,
    ]);
    const pending = rows[0]?.pending;
    if (pending) {
      try {
        const secret = openSecret(pending);
        return { secret, uri: otpauthUri(secret, email, "Everydaypane admin") };
      } catch {
        // sealed with another key — start again
      }
    }
  }
  const secret = newSecret();
  await run(
    `INSERT INTO admin_two_factor (email, pending) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET pending = excluded.pending WHERE admin_two_factor.enabled_at IS NULL`,
    [email, sealSecret(secret)],
  );
  return { secret, uri: otpauthUri(secret, email, "Everydaypane admin") };
}

function backupStatements(email: string): { codes: string[]; statements: { sql: string; args: string[] }[] } {
  const codes = newBackupCodes();
  return {
    codes,
    statements: [
      { sql: "DELETE FROM admin_backup_codes WHERE email = ?", args: [email] },
      ...codes.map((c) => ({ sql: "INSERT INTO admin_backup_codes (email, code_hash) VALUES (?, ?)", args: [email, hashBackupCode(c)] })),
    ],
  };
}

const otherSessions = (email: string, sessionHash: string) => [
  {
    sql: "DELETE FROM admin_session_steps WHERE token_hash IN (SELECT token_hash FROM admin_sessions WHERE email = ? AND token_hash != ?)",
    args: [email, sessionHash],
  },
  { sql: "DELETE FROM admin_sessions WHERE email = ? AND token_hash != ?", args: [email, sessionHash] },
];

export type StepResult = "ok" | "bad" | "limited";

const limited = async (email: string, now: number) => !(await rateLimit(`admin-2fa:${email}`, 8, 10 * 60_000, now));

export async function confirmEnrolment(
  email: string,
  code: string,
  sessionHash: string,
  now = Date.now(),
): Promise<{ result: StepResult; codes?: string[] }> {
  if (await limited(email, now)) return { result: "limited" };
  const rows = await query<{ pending: string | null; enabled_at: number | null }>(
    "SELECT pending, enabled_at FROM admin_two_factor WHERE email = ?",
    [email],
  );
  const row = rows[0];
  if (!row?.pending || row.enabled_at != null) return { result: "bad" };
  const step = verifyTotp(openSecret(row.pending), code, null, now);
  if (step == null) return { result: "bad" };
  const backup = backupStatements(email);
  await batch([
    {
      sql: "UPDATE admin_two_factor SET secret = pending, pending = NULL, enabled_at = ?, last_step = ? WHERE email = ?",
      args: [now, step, email],
    },
    ...backup.statements,
    ...otherSessions(email, sessionHash),
    { sql: "INSERT OR REPLACE INTO admin_session_steps (token_hash, at) VALUES (?, ?)", args: [sessionHash, now] },
  ]);
  return { result: "ok", codes: backup.codes };
}

export async function checkSecondFactor(email: string, input: string, now = Date.now()): Promise<StepResult> {
  if (await limited(email, now)) return "limited";
  const rows = await query<{ secret: string | null; last_step: number | null }>(
    "SELECT secret, last_step FROM admin_two_factor WHERE email = ? AND enabled_at IS NOT NULL",
    [email],
  );
  const row = rows[0];
  if (!row?.secret) return "bad";
  const text = input.trim();
  let ok = false;
  if (looksLikeBackupCode(text)) {
    ok =
      (await run("UPDATE admin_backup_codes SET used_at = ? WHERE email = ? AND code_hash = ? AND used_at IS NULL", [
        now,
        email,
        hashBackupCode(text),
      ])) > 0;
  } else {
    const step = verifyTotp(openSecret(row.secret), text, row.last_step == null ? null : Number(row.last_step), now);
    if (step != null) {
      ok =
        (await run("UPDATE admin_two_factor SET last_step = ? WHERE email = ? AND (last_step IS NULL OR last_step < ?)", [
          step,
          email,
          step,
        ])) > 0;
    }
  }
  return ok ? "ok" : "bad";
}

export const markSessionPassed = (sessionHash: string, now = Date.now()) =>
  run("INSERT OR REPLACE INTO admin_session_steps (token_hash, at) VALUES (?, ?)", [sessionHash, now]);

export async function regenerateBackupCodes(email: string): Promise<string[]> {
  const backup = backupStatements(email);
  await batch(backup.statements);
  return backup.codes;
}

export async function disableTwoFactor(email: string, keepSession: string | null): Promise<void> {
  await batch([
    { sql: "DELETE FROM admin_two_factor WHERE email = ?", args: [email] },
    { sql: "DELETE FROM admin_backup_codes WHERE email = ?", args: [email] },
    ...otherSessions(email, keepSession ?? ""),
    ...(keepSession ? [{ sql: "DELETE FROM admin_session_steps WHERE token_hash = ?", args: [keepSession] }] : []),
  ]);
}

export async function enrolledEmails(): Promise<Set<string>> {
  const rows = await query<{ email: string }>("SELECT email FROM admin_two_factor WHERE enabled_at IS NOT NULL");
  return new Set(rows.map((r) => String(r.email)));
}
