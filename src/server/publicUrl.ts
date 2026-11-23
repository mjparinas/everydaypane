import "server-only";

import { lookup } from "node:dns/promises";

// Shared check for anything the server fetches from an address an admin pasted (calendar links, the school page,
// album art, a list of photo addresses). https only, no name and password in the address, and never this machine,
// a `.local` name, or a private network — including a public name that resolves to one.

const PRIVATE_MESSAGE = "The address moved off a public https address.";
const MAX_REDIRECTS = 5;

function ipv4Parts(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

/** A literal address on a private, loopback, link-local or otherwise non-public range. */
export function isPrivateIp(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }
  if (!ip.includes(":")) return false;
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped?.[1]) return isPrivateIp(mapped[1]);
  if (/^f[cd][0-9a-f]{0,2}:/.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true;
  if (/^ff[0-9a-f]{0,2}:/.test(ip)) return true;
  return false;
}

/** A host the server must not connect to: localhost, mDNS, or a literal private address. */
export function isPrivateHost(host: string): boolean {
  const h = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+$/.test(h)) return true;
  if (ipv4Parts(h)) return isPrivateIp(h);
  if (h.includes(":")) return isPrivateIp(h);
  return false;
}

/** A public https address, or null. Rejects credentials, other schemes, and private hosts. */
export function publicHttpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (isPrivateHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function assertPublicDns(hostname: string): Promise<void> {
  if (isPrivateHost(hostname)) throw new Error(PRIVATE_MESSAGE);
  let addresses: string[];
  try {
    const found = await lookup(hostname, { all: true, verbatim: true });
    addresses = found.map((a) => a.address);
  } catch {
    throw new Error(PRIVATE_MESSAGE);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateHost(a) || isPrivateIp(a))) throw new Error(PRIVATE_MESSAGE);
}

/**
 * Fetches a public https address without following redirects itself. Each hop is checked again (scheme, host, and
 * where DNS points) so a public name can't bounce the request onto the home network.
 */
export async function fetchPublicHttps(raw: string, init: RequestInit = {}): Promise<Response> {
  let current = publicHttpsUrl(raw);
  if (!current) throw new Error(PRIVATE_MESSAGE);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicDns(new URL(current).hostname);
    const r = await fetch(current, { ...init, redirect: "manual" });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel().catch(() => undefined);
      if (!loc || hop === MAX_REDIRECTS) throw new Error(PRIVATE_MESSAGE);
      const next = publicHttpsUrl(new URL(loc, current).toString());
      if (!next) throw new Error(PRIVATE_MESSAGE);
      current = next;
      continue;
    }
    if (r.url && !publicHttpsUrl(r.url)) {
      await r.body?.cancel().catch(() => undefined);
      throw new Error(PRIVATE_MESSAGE);
    }
    return r;
  }
  throw new Error(PRIVATE_MESSAGE);
}
