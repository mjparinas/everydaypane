import { BRAND } from "./brand";

/** Canonical site URL (set `NEXT_PUBLIC_SITE_URL` in Vercel / local env; baked into the client at build). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.everydaypane.com").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@everydaypane.com";

/** Where signed-in families land. */
export const APP_PATH = "/household/";

/** Public Free signup (magic link creates a household when the email is new). */
export const SIGNUP_PATH = "/signin/?intent=signup";

export const FAMILY_PATH = "/family/";

export { BRAND };
