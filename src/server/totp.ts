import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "./env";

// Ported from Liftsmith/Gradelings for platform admin two-step sign-in.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]!;
  return out;
}

export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text.toUpperCase().replace(/[\s=-]/g, "")) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function codeAtStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const n = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(n % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(now);
  let hit: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    if (same(codeAtStep(secret, step), clean) && (lastStep == null || step > lastStep)) hit = step;
  }
  return hit;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const BACKUP_CODE_COUNT = 8;

export function newBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const pick = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!).join("");
    return `${pick()}-${pick()}`;
  });
}

export const normaliseBackupCode = (code: string) => code.toLowerCase().replace(/[\s-]/g, "");

export const hashBackupCode = (code: string) =>
  createHash("sha256")
    .update(`backup:${normaliseBackupCode(code)}`)
    .digest("hex");

export const looksLikeBackupCode = (code: string) => /^[a-z2-9]{10}$/.test(normaliseBackupCode(code));

function twoFactorKey(): Buffer | null {
  const k = env.twoFactorKey();
  return k.length >= 16 ? createHash("sha256").update(`two-factor:${k}`).digest() : null;
}

export function sealSecret(secret: string): string {
  const k = twoFactorKey();
  if (!k) return `plain.${secret}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function openSecret(stored: string): string {
  if (stored.startsWith("plain.")) return stored.slice(6);
  const [version, iv, tag, body] = stored.split(".");
  const k = twoFactorKey();
  if (version !== "v1" || !iv || !tag || !body || !k) {
    throw new Error("The two-step secret can't be read (is TWO_FACTOR_KEY set to the value it was saved with?)");
  }
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
