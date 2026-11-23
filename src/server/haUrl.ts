import "server-only";

/**
 * Home Assistant's public https address (Cloudflare Tunnel), or null. Never this machine or a private network: the
 * stored Bearer token and Access pair are sent to whatever URL is saved, so a changed address must not point at an
 * attacker or an internal host.
 */
export function publicHaUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":")
    )
      return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export const normalizeHaUrl = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
export const sameHaUrl = (a: string, b: string) => normalizeHaUrl(a) === normalizeHaUrl(b);
