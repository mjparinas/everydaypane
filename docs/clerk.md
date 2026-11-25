# Clerk authentication

Everydaypane uses [Clerk](https://clerk.com) for household and platform-staff identity. Turso stays the source of truth for household membership (`accounts` / `account_members`, admin vs family). Wall display unlock (`/display/unlock/` QR / phone code, `ep_wall` + `ep_display`) is unchanged and does not use Clerk.

## Dashboard setup

1. Create an application (or `vercel integration add clerk`).
2. **User & authentication:** enable email address, verify at sign-up with **Email verification code**, sign-in with email code. Disable passwords unless you want them.
3. **Staff MFA:** require a second factor for users on `ADMIN_EMAILS` / `SUPPORT_EMAILS` (Authenticator). Set `ADMIN_2FA=optional` only for local staff smoke tests.
4. **Paths:** sign-in and sign-up URL `/signin` (this app uses one page for both).
5. **Webhook:** `user.created` → `https://www.everydaypane.com/api/clerk/webhook/` with `CLERK_WEBHOOK_SIGNING_SECRET`. On create, we call `createAccount` when the email is new (household name from `unsafeMetadata.householdName`).
6. Brand Clerk emails to match Everydaypane (mark blue `#3b5bdb`); alert mail still goes through Resend (`src/lib/email.ts`).

## Env

See `.env.example`: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`.

### Production DNS (Frontend API)

Clerk production instances usually serve the Frontend API on a subdomain such as `https://clerk.everydaypane.com`
(CNAME in your DNS → Clerk). The browser calls that host for sign-in/sign-up. Our CSP must allow it in
`connect-src` / `script-src` / `frame-src` (set `NEXT_PUBLIC_CLERK_FRONTEND_API` if the host isn’t the default).

If you see `ClerkJS: Network error … Failed to fetch` against `clerk.everydaypane.com`, check:

1. DNS + SSL for that host (it should answer Clerk’s API, not a parking page).
2. CSP includes that exact origin (not only `*.clerk.com`).
3. The app does not proxy `/__clerk`. That path returns `host_invalid` unless the Dashboard proxy URL is set. Leave `frontendApiProxy` off while the CNAME is in use.

## Import existing members

```bash
node scripts/clerk-export-users.mjs > clerk-users.json
npx clerk@latest migrate import ./clerk-users.json --source --dry-run
npx clerk@latest migrate import ./clerk-users.json --source --yes
```

Users have no passwords; they sign in with an email code after import.

## Local / CI without Clerk

Set `AUTH_TEST_MODE=1` and leave Clerk keys empty. Sign-in uses `/api/auth/test-signin/` and an `ep_test_session` cookie. Playwright (`scripts/e2e.mjs`) does this automatically. Never enable `AUTH_TEST_MODE` in production.
