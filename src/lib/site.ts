import { BRAND } from "./brand";

/** Canonical site URL (set `NEXT_PUBLIC_SITE_URL` in Vercel / local env; baked into the client at build). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.everydaypane.com").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@everydaypane.com";

/** Where signed-in families land. */
export const APP_PATH = "/household/";

export const FAMILY_PATH = "/family/";

export { BRAND };
