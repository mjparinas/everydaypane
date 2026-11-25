import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "./env";

// Small helpers around node:crypto. Stored secrets (Google refresh token, Amazon cookie, Home Assistant token) are
// encrypted with AES-256-GCM under a key derived from SESSION_SECRET, so a leaked database alone reveals none of them.

function key(purpose: string): Buffer {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(purpose).digest();
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A cryptographically random, case-sensitive code with no URL punctuation. */
export function randomAlphanumeric(length: number): string {
  return Array.from({ length }, () => ALPHANUMERIC.charAt(randomInt(ALPHANUMERIC.length))).join("");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("secrets"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(sealed: string): string | null {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const decode = (value: string): Buffer | null => {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
      const decoded = Buffer.from(value, "base64url");
      return decoded.toString("base64url") === value ? decoded : null;
    };
    const ivBytes = decode(iv);
    const tagBytes = decode(tag);
    const bodyBytes = decode(body);
    if (!ivBytes || ivBytes.length !== 12 || !tagBytes || tagBytes.length !== 16 || !bodyBytes) return null;
    const decipher = createDecipheriv("aes-256-gcm", key("secrets"), ivBytes);
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(bodyBytes), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Constant-time string comparison, for secrets in headers. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
