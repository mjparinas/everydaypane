import { BRAND } from "./brand";

/** Canonical site URL (set `NEXT_PUBLIC_SITE_URL` in Vercel / local env; baked into the client at build). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.everydaypane.com").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@everydaypane.com";

/** Where signed-in families land. */
export const APP_PATH = "/household/";

/** Wall dashboard gate (QR unlock or signed-in picker). Melvin, 2026-11-23. */
export const DISPLAY_PATH = "/display/";

/** Public Free signup (Clerk email code + webhook creates a household when the email is new). */
export const SIGNUP_PATH = "/signin/?intent=signup";

export const FAMILY_PATH = "/family/";

export { BRAND };
