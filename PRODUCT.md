# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Households who want the home at a glance on an always-on wall or kitchen panel (about 1920×1080 landscape touch, or any screen with a browser), set up and day-to-day edited from a phone. Founding household is Melvin’s family in Langley, BC; the product is now Free + Household for other families. Kids use chore flows on phone and wall; household admins configure views, themes, displays, and integrations.

**Staff operators (platform `/admin/`):** Melvin as Everydaypane admin (`ADMIN_EMAILS`). They triage product health, households, displays, billing, and flags under load — often mid-support call or morning check-in. Confirmed 2026-11-25: day-to-day is Melvin, not a large ops team.

## Product Purpose

Everydaypane is a fast, glanceable wall dashboard for the home, with a household panel that works on a phone. Success means the wall stays readable at a glance without fuss, and the family can change meals, shopping, messages, chores, and layout without fighting the tool. Staff can run the multi-tenant product safely from `/admin/`.

## Positioning

A castable browser wall dashboard that stays super-lightweight on the display (server-rendered HTML + a small esbuild bundle, not a React app), paired with a capable phone household panel. Local-home depth—Home Assistant, BC alerts/transit/ferries/garbage, family meals/shopping/chores/messages—without a heavy display client. Neighbours in spirit: MagicMirror, DAKboard, homescreens.dev. Brand written **Everydaypane** (one word, capital E only).

## Operating Context

- Wall: Chromecast / TV / kiosk / Fire tablet opened to `/display/` or `/d/<token>/`, often landscape kitchen panel; unlock via phone QR.
- Phone: `/household/` for setup; `/family/` and `/d/<token>/edit/` for meals, shopping, messages without full admin; kids chore pages.
- Time-of-day views (morning, afternoon, evening, overnight), day/night themes, burn-in protection, offline mode, screen saver.
- Canadian English in everything a person reads (colour, centre, favourite).
- B.C. permanent daylight time: Vancouver clocks/dates/calendars/schedules stay on fixed UTC−7 after the March 2026 transition even when the display browser has stale zone data.
- Staff `/admin/`: Clerk sign-in, then `ADMIN_EMAILS` (no in-app 2FA); tabs grouped Work / Numbers / People / Running; deep links `?tab=&days=&q=&open=`; ops-cockpit refinements (2026-11-24): confirm-to-act mutations, group+strip nav, Overview command centre, clarified copy, debounced search, ⌘K palette, bulk household plan/note, Displays → Open household.
- Hosting: Vercel + Turso; marketing at everydaypane.com.

## Capabilities and Constraints

- Free vs one paid plan (**Household**): Free is DAKboard-like (1 view, 2 calendars, 2 displays, core widgets); Household unlocks everything. Melvin’s install is grandfathered (`acct_legacy`). Soft upgrade CTAs; Free core stays usable.
- Display budget: script under 40 KB gzipped, stylesheet under 20 KB; no React on the unlocked wall; new display dependencies need a strong reason.
- Wall intentionally blocks pinch-zoom on `/d/…` (fixed kitchen layout). Household panel and `/family/` still allow zoom.
- Marketing site public: `/`, `/pricing/`, `/features/`, `/compare/`, `/blog/`, `/privacy/`, `/terms/`, `/contact/`.
- Platform ops at `/admin/` (staff); customer path is `/household/`.
- Domain: everydaypane.com / www (live).
- **Staff `/admin/` Session 5 (built 2026-11-24):** ⌘K/Ctrl+K command palette (tabs + household search); bulk select on Households (plan + note, admin only); Displays “Open household” cue (no staff wall impersonation); no new top-level admin tabs; deep links preserved. Support may navigate via palette; write bulk stays admin-only.
- **Household `/household/` (H1–H6 built 2026-11-24, critique fixes 2026-11-24):** five destinations on phone and desktop (Views, Colours, Displays, Family, Settings); Family hub + thumb Publish dock; wall settings use “Publish to wall” / “Wall settings · Unsaved”; Family lists stay live; Settings Everyday ≤4 chips (Calendars & tasks, Family tools, Photos & music, Screen & alerts); Add widget recommends four kitchen defaults first; quieter Free (Plan chip only on idle chrome). Views templates collapsed (open on empty); Displays “Get kitchen online”; upgrade closes back to prior hash. Free gates and Canadian English stay; no heavy new deps.
- **Widgets + views (W1–W4 built 2026-11-24):** type-first widget settings + Panel chrome section; Free badge note in drawer; shopping/messages empty-state Add; clearer check affordance; Views Gap/Edge/Tile plain labels; on-photos cue in live editor; marketing behaviours copy synced (catalogue already follows WIDGET_GROUPS). Display stays transform/opacity-cheap.

## Brand Commitments

- Written name: **Everydaypane** (one word, capital E only — not EverydayPane or Everyday Pane). URLs and handles: `everydaypane`. Aloud, “Everyday Pane” once is fine; short form later: Pane.
- Wordmark: everyday**pane** in Manrope 800 with “pane” in brand blue `#3b5bdb`. Mark: rounded blue square with three panes (clock hands, amber sun, pale). Assets in `public/brand/` (and generated `public/icons/`).
- Branded outbound email (Resend) reuses `src/lib/email.ts` chrome — same blue, mark, wordmark, soft `#f6f7fb` page / white card. Do not invent a third email template style.
- Marketing site: Manrope display; template preview screenshots from `public/templates/` — no personal family photos in OG or marketing.
- Staff UI tone for `/admin/`: sharper denser “ops cockpit” (confirmed 2026-11-24), Everydaypane nouns (Households, Displays, Free vs Household).

## Evidence on Hand

- Real widget sample PNGs in `public/features/widgets/` and starter template screenshots in `public/templates/` (regenerate with `npm run templates:previews`).
- Sample feeds/photos for previews in `scripts/template-samples/` and `public/templates/samples/`.
- Brand SVGs in `public/brand/`.
- Product decisions and architecture: `AGENTS.md`. Admin UI: `src/app/admin/`, `src/lib/adminTabs.ts`.
- Critique archive: `.impeccable/critique/` (prior `/admin` and `/household` runs).
- No customer testimonials or private family photos for public marketing — do not fabricate either.

## Product Principles

1. Glance first on the wall; complexity belongs in the household panel and server.
2. Family workflows (meals, shopping, messages, chores) must work from a phone in the kitchen, including QR edit without sign-in where designed.
3. Preserve Free usefulness; Household upgrades should be clear, not nagging.
4. Local and home integrations earn their place when they reduce another app or tab the household already juggles.
5. Prefer Canadian English and BC-relevant defaults without locking the product to one town.
6. High-stakes staff actions need confirmation and clear failure feedback; progressive disclosure beats more top-level tabs.

## Accessibility & Inclusion

- Wall display (`/d/…`): known intentional exception to WCAG 2.2 **1.4.4** and **1.4.10** (pinch-zoom disabled for a fixed 1920×1080 kitchen layout). Do not “fix” without Melvin.
- Household panel, `/family/`, and `/admin/` allow zoom.
- Timer / pomodoro / alarm flashes honour `prefers-reduced-motion: reduce`.
- Staff controls should keep visible focus, named buttons, and usable touch targets on phone.
