import { BRAND } from "./brand";

/** Canonical site URL. pane.getliftsmith.com until everydaypane.com is bought (AGENTS.md). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://pane.getliftsmith.com").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@getliftsmith.com";

/** Where signed-in families land. */
export const APP_PATH = "/household/";

export const FAMILY_PATH = "/family/";

export { BRAND };
