import { BRAND } from "./brand";

/** Canonical site URL (set `NEXT_PUBLIC_SITE_URL` in Vercel / local env; baked into the client at build). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.everydaypane.com").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@everydaypane.com";

/** Where signed-in families land. */
export const APP_PATH = "/household/";

/** Wall dashboard gate (QR unlock or signed-in picker). Melvin, 2026-11-23. */
export const DISPLAY_PATH = "/display/";

/**
 * Sign-in and sign-up targets. Production sets the Clerk Account Portal
 * (`https://accounts.everydaypane.com/sign-in` and `/sign-up`). Unset, local and CI stay on `/signin/`.
 */
export function authHref(base: string, next?: string): string {
  if (!next) return base;
  if (/^https?:\/\//.test(base)) {
    const url = new URL(base);
    url.searchParams.set("redirect_url", `${SITE_URL}${next.startsWith("/") ? next : `/${next}`}`);
    return url.toString();
  }
  const url = new URL(base, "http://local");
  url.searchParams.set("next", next);
  return `${url.pathname}${url.search}`;
}

export function signInHref(next?: string): string {
  return authHref(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL?.trim() || "/signin/", next);
}

export function signUpHref(next?: string): string {
  return authHref(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL?.trim() || "/signin/?intent=signup", next);
}

/** Public Free signup. Production opens the Account Portal and returns to the household. */
export const SIGNUP_PATH = signUpHref("/household/");

/** Header sign-in. Production opens the Account Portal and returns to the household. */
export const SIGN_IN_PATH = signInHref("/household/");

export const FAMILY_PATH = "/family/";

export { BRAND };
