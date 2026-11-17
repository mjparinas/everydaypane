# Everydaypane: guide for agents

Everydaypane is a wall dashboard for the home (in the spirit of MagicMirror, DAKboard and homescreens.dev), built for
Melvin's family in Langley, BC. It runs on a **Ubiquiti UniFi UC-Display21** (a low-power 21.5" 1920 × 1080 touchscreen)
and any other screen with a browser, and is set up from an admin panel that works on phones. This file holds the
decisions behind it, with who made them and when. Follow them; if a task seems to need one changed, raise it with
Melvin first, and update this file in the same change when a decision changes.

## Commands

```bash
npm run dev            # http://localhost:3000 (admin at /admin/, sign-in links print to the terminal)
npm test               # Vitest unit and integration tests
npm run test:coverage
npm run lint && npm run typecheck && npm run format:check
npm run build          # production build (what Vercel runs)
node scripts/e2e.mjs   # Playwright browser tests against the build (CHROMIUM_PATH=… to use a local Chromium)
```

## Product decisions

- **Name and repo** (Melvin, 2026-11-17): the app is **Everydaypane**, in `mjparinas/everydaypane`. The domain
  everydaypane.com was available on 2026-11-17 but has not been bought yet.
- **Features** (Melvin, 2026-11-17): photos (Amazon Photos, choosable by person), full Google Calendar (a today
  schedule view and a month calendar view), weather for the week with icons, clocks for Vancouver and Toronto, the date,
  a WiFi QR code, countdowns to holidays and birthdays, air quality, garbage pickup from the Township of Langley's
  collection calendar, Home Assistant controls, several views to choose from, views that change by time of day
  (morning, afternoon, evening, night), day and night mode, customizable colour schemes and every widget's settings,
  a drag-and-drop grid with a chosen number of rows and columns.
- **Added the same day** (Melvin, 2026-11-17): offline mode, admin sign-in by magic link through Resend, Sentry,
  burn-in protection, UniFi Protect video (cameras and doorbell pop-ups), a family message board, and emergency alerts.
- **Emergency alerts** (Melvin, 2026-11-17): urgent alerts for Langley, the Lower Mainland, BC and Canada (Alert
  Ready/NAAD, Environment Canada weather warnings, DriveBC road events for torrential rain or snow, Earthquakes Canada,
  tsunami and flooding). They show as a **red strip across the top of the screen that can be dismissed**, not a
  full-screen takeover (`config.alerts.banner` sets the lowest severity that gets the strip).
- **Admin changes reach displays by polling** (Melvin, 2026-11-17: "we dont need real time push for now, polling is
  ok"). Every display asks for the settings version every 30 seconds (a tiny request answered with 304 when nothing
  changed) and reloads its settings when it moves. No WebSocket or push service.
- **Logo** (Melvin asked for one, 2026-11-17): a rounded blue square holding three panes (a tall white one with clock
  hands, an amber "sun" pane, a pale one), and the wordmark "everyday**pane**" in Manrope 800 with "pane" in the brand
  blue. Sources are SVGs in `public/brand/` (mark, simplified 16–32 px favicon, maskable, light and dark wordmarks);
  the PNG icons, `favicon.ico` and the web app manifest (`src/app/manifest.ts`) are made from them.
- **Canadian English** in everything a person reads (colour, centre, favourite), as in Liftsmith.

## Display: super lightweight (rule, Melvin, 2026-11-17)

"Emphasize super lightweight front end for the dashboard so it loads quickly and is responsive. The backend or admin
panel can be complex if you need it to be."

- The display (`/d/<token>/`) is **not a React page**. It is server-rendered HTML plus one small TypeScript module
  bundled by esbuild (`src/display/` → `public/display/`), with no framework. Widgets update only the DOM nodes that
  change (the clock rewrites one text node a second).
- **Budget:** the display's script stays under 40 KB gzipped and its stylesheet under 10 KB (`scripts/bundle-check.mjs`,
  a CI step). A new dependency on the display needs a very good reason.
- All heavy lifting happens on the server: API calls to Google, weather, Recycle Coach, Amazon and Home Assistant are
  made, cached and trimmed by our routes, and the display fetches small JSON. Images are proxied at display size.
- Animations use `transform` and `opacity` only. Backdrop blur ("glass") is off by default because it costs GPU time.
- The admin panel and backend may be as complex as needed (Next.js, React, Zustand).

## Stack (Melvin, 2026-11-17: like Liftsmith and Gradelings)

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript 6 (`@typescript/typescript6`), Tailwind 4, Zustand,
  Turso/libsql, zod (server and admin only), Vitest, Playwright, ESLint 10 (`eslint-config-next` plus type-aware rules),
  Prettier (width 140, sorted imports).
- **Latest versions, pinned exactly** in `package.json`; Dependabot keeps them current.
- **Strict TypeScript** plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`. No `any` (lint error). Lint runs with `--max-warnings 0`.

## Architecture

- **One settings document** (`src/lib/config/schema.ts`, validated with zod on every save) holds views, widgets,
  themes, the schedule and integration settings. It is versioned: a save names the version it started from, a stale save
  is refused with 409, and every save bumps the version displays poll for (`src/server/config.ts`).
- **Secrets are not in the document.** Tokens (Google refresh token, Amazon cookie, Home Assistant token) are stored
  encrypted (AES-256-GCM, key from `SESSION_SECRET`) in the `secrets` table and never sent to a browser
  (`src/server/secrets.ts`). The WiFi password is the exception: showing it is the widget's job.
- **Database:** Turso in production (`DATABASE_URL` + `DATABASE_AUTH_TOKEN`, or the `TURSO_*` pair Vercel's
  integration creates), `file:local.db` in development, memory in tests. Tables are created on first use; migrations only
  ever add (`src/server/db.ts`).
- **Displays** are devices with their own secret address `/d/<token>/` (only the hash is stored). A device shows one
  view, or follows the time-of-day schedule. Deleting a device signs that screen out.
- **Admin panel** (`src/app/admin/_ui/`): one page with tabs (a bottom tab bar on phones). Edits collect in a working
  copy (a Zustand store per page) and go out together with Save. The grid editor drags with pointer events (mouse and
  touch) and also moves and resizes with the keyboard; widgets never overlap or leave the grid (`src/lib/config/grid.ts`).
- **Family message board:** anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS` posts notes from `/family/`; the author name is
  typed, never the email, because the wall is readable by anyone in the kitchen. Notes can expire; admins pin. Displays
  poll the board every 30 seconds with an ETag.
- **Garbage pickup:** the Township of Langley's collection calendar (tol.ca) is Recycle Coach, project 521,
  district `LANGL`, with zones such as Monday A or Thursday B. The zone is looked up from the address in the admin
  panel (or picked by hand) and the schedule is fetched and cached by the server.
- **Home Assistant and UniFi Protect:** the server calls Home Assistant (so it must be reachable from Vercel, e.g.
  through Nabu Casa or a tunnel). UniFi Protect cameras and the doorbell come through Home Assistant's UniFi Protect
  integration, because Protect itself is only on the local network.

## Security

- **Sign-in by magic link** (Melvin, 2026-11-17), as Liftsmith's admin does it: a one-time link (15 minutes) emailed
  through Resend to an address on `ADMIN_EMAILS` (full admin) or `FAMILY_EMAILS` (message board only). The lists live in
  the environment, so nothing a request writes can make someone an admin; removing an address signs it out. Links and
  sessions are stored only as hashes. The emailed link opens a page whose button uses the link up, so mail scanners
  can't. A link is used up in one statement, so two racing requests can't both sign in.
- Sign-in tries are rate-limited in the database (one atomic upsert), per address and per IP.
- Requests that change something must come from our own origin (`sameOrigin`).
- Security headers on every response (`src/lib/securityHeaders.ts`): HSTS, nosniff, `frame-ancestors 'none'`, a CSP
  that allows only our own origin (and Sentry's ingest), and a Permissions-Policy that turns off camera, microphone
  and location.
- Error reports are scrubbed of emails, display tokens and cookies before they leave (`src/lib/sentryScrub.ts`).

## Monitoring (Melvin, 2026-11-17)

- **Sentry**, off unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set. Server errors through `instrumentation.ts`.
  The admin panel loads the Sentry library only after the first error (as in Gradelings). The display never loads it:
  it posts its errors to our own route, which forwards them to Sentry from the server.

## Testing and CI/CD (Melvin, 2026-11-17: "dont forget testing in cicd")

- `.github/workflows/ci.yml` runs on every pull request and every push to `main`: types, lint, formatting and
  dependency audit; Vitest with coverage; the production build; and the Playwright browser tests against that build
  (`scripts/e2e.mjs`, which signs in through a real magic link and fails on any console error). **"CI passed"** is the
  one check to require.
- A bug fix comes with a test that fails without it. Flaky tests are fixed at the cause, never retried.
- Test data is plain and readable; nothing random.
- **Agents fix and merge their own pull requests** (Melvin, 2026-11-17: "auto fix and merge prs please"). An agent
  fixes CI failures and review feedback on the pull requests it opens, and merges each one once "CI passed" is green.
  Stacked pull requests merge in order, the base first, with a merge commit so the next one stays clean.
- **Dependabot** (`.github/dependabot.yml`) opens weekly pull requests for npm (minor and patch grouped) and GitHub
  Actions.

## Hosting (Melvin, 2026-11-17)

- **Vercel**, deployed by Vercel's GitHub integration: a merge to `main` deploys to production. The project is
  `everydaypane` in team `melvins-projects-b69f55c3` (created 2026-11-17). Environment variables live in Vercel, never in
  the repo (`.env.example` lists them).
- **Preview deployments are off**, as in Liftsmith; CI's own build and browser tests cover pull requests.
- **Vercel Authentication is off** for this project: a display can't sign in to Vercel, and every page and API route
  checks its own session or display token.
- **Address:** `pane.getliftsmith.com` until everydaypane.com is bought (Melvin, 2026-11-17). getliftsmith.com's DNS is
  on Cloudflare, so the record there is a DNS-only (grey cloud) CNAME `pane` → `cname.vercel-dns.com`.
  `NEXT_PUBLIC_SITE_URL` in Vercel holds the address used in sign-in links.
- **Sign-in email** is sent from `hello@getliftsmith.com` (verified in Resend, click tracking off so links aren't
  rewritten) until everydaypane.com is bought (Melvin, 2026-11-17). `ADMIN_EMAILS` is Melvin's own address.
- **Database:** a Turso database from the Vercel Marketplace integration, connected to the project (its `TURSO_*`
  variables are read by `src/server/db.ts`).

## Code conventions

- Prettier formats every code file; run `npm run format` before committing.
- Server-only modules start with `import "server-only"`. The display never imports zod or React.
- Comments explain why, and name who decided and when for product rules.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
