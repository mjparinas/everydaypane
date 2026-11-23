/** Ambiguous-free alphabet (Tuned / similar device-code UIs). Shared by server and phone UI. */
export const DEVICE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const DEVICE_CODE_LENGTH = 8;

/** Strip dashes/spaces, uppercase; null if not a valid eight-character code. */
export function normalizeDeviceCode(value: unknown): string | null {
  const code = String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (code.length !== DEVICE_CODE_LENGTH) return null;
  for (const ch of code) if (!DEVICE_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Human form shown on the display and in the QR URL (`K7QF-29MD`). */
export function formatDeviceCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function phoneSignInPath(code: string): string {
  return `/signin/phone/?code=${encodeURIComponent(formatDeviceCode(code))}`;
}
