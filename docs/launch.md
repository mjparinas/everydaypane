# Everydaypane launch & growth

Living go-to-market checklist for Melvin and agents. Update this file when a launch criterion lands or a decision changes. Product rules still live in `AGENTS.md`.

**Measurement (privacy-first):** Google Search Console (organic), Stripe Dashboard (paid), platform `/admin/` household list (signups). No on-site analytics cookies until Melvin opts in and Privacy is updated.

---

## Launch criteria

| Criterion | Status | Notes |
| --- | --- | --- |
| Public Free signup UI → `POST /api/auth/signup/` | Done in product | `/signin/?intent=signup`; “Start free” CTAs use `SIGNUP_PATH` |
| Free / Household copy matches `plans.ts` | Done in product | 2 displays, 1 view, 2 calendars; paid plan named **Household** |
| Privacy & Terms for public accounts | Done in product | Self-serve Free; Stripe Household; no “env allowlist only” |
| Household Upgrade + Customer Portal | Done in product | Settings › Plan (`PlanSettingsCard`) + upgrade dialog from soft CTAs |
| RSS alternate + Privacy chrome | Done in product | Blog metadata; Privacy uses `SiteChrome` + `pageMeta` |
| Stripe `STRIPE_PRICE_ID` (monthly) in Vercel | Ops | Webhook endpoint `/api/stripe/webhook/` |
| Yearly Stripe price | Blocked | Marketing shows $59/yr; checkout uses monthly until `STRIPE_PRICE_ID_YEARLY` exists |
| Domain `everydaypane.com` + `NEXT_PUBLIC_SITE_URL` | Ops | See [Domain & email cutover](#domain--email-cutover) |
| Resend `MAIL_FROM` / contact on everydaypane.com | Ops | |
| Google Search Console + sitemap | Ops | After canonical domain is final |
| Soft launch (invite Free users) | Cadence | After signup works on production |
| Public launch day | Cadence | After soft launch + 2–4 weeks content |

---

## Funnel

```
Visit marketing → Start free (/signin/?intent=signup)
  → magic link → /household/
  → Displays: add display, copy /d/… URL
  → (optional) Settings › Plan → Household Checkout / Portal (or in-app upgrade dialog)
```

Upgrade moments: Free hits view / widget / calendar / display limits (`planGates.ts`); soft Household CTAs and Settings › Plan.

---

## Keyword clusters & content backlog

Ship about one guide or compare refresh every 1–2 weeks in `src/content/posts.ts`. Each post already ends with a Free CTA.

| Cluster | Target pages | Backlog ideas |
| --- | --- | --- |
| Category | `/`, `/features/`, `/pricing/` | “family wall dashboard”, “kitchen display dashboard” |
| Alternatives | `/compare/dakboard/`, blog compares | Refresh facts quarterly; AlternativeTo outreach |
| Local BC | Guides + features | TransLink, BC Ferries, Langley garbage, Alert Ready interlinks |
| How-to | Blog guides | Wall panel / Chromecast / Fire tablet start page (see `setup-wall-display`) |

**Do not** invent widgets for SEO — extend marketing, compare and blog only.

---

## Free promotion playbook

Execute manually; no spam. Lead with Free tier and BC / Home Assistant strengths.

| Channel | When | Notes |
| --- | --- | --- |
| Soft launch | After production signup | Friends/family + a few HA users; fix friction |
| Reddit | Soft → public | r/homeassistant, r/selfhosted, r/homelab, r/MagicMirror, regional BC — value posts, not ads |
| HA / MagicMirror forums | Soft → public | “Alongside HA”, not a replacement |
| Indie Hackers / HN Show HN | Public launch day | After domain + signup polished |
| Product Hunt (or similar) | Public launch day | One coordinated day |
| Directories | After public | AlternativeTo; G2 later; “DAKboard alternatives” listicles |
| Blog / RSS | Ongoing | Share each new guide |
| Personal proof | Anytime | Template screenshots only — no private family photos |

**Cadence:** soft launch (signup + Free) → 2–4 weeks content/SEO → public launch day.

---

## Domain & email cutover

Melvin-owned ops (code defaults already favour everydaypane.com where set).

1. Point **everydaypane.com** (and www) at the Vercel project; set `NEXT_PUBLIC_SITE_URL` (e.g. `https://www.everydaypane.com`).
2. Verify Resend for `hello@everydaypane.com`; set `MAIL_FROM`. Keep `CONTACT_EMAIL` in `src/lib/site.ts` aligned.
3. Update OAuth redirect URIs: Google, Microsoft, Spotify, Sonos, Nest, ecobee, SmartThings, Dropbox, Box, SmugMug, Fitbit, Slack, Trello, YNAB as connected.
4. Add the property in Google Search Console; submit `https://…/sitemap.xml`.
5. Keep `pane.getliftsmith.com` as a permanent redirect to everydaypane.com so old links and OAuth leftovers heal.

Open decisions: exact public launch date; creating Stripe yearly price + wiring `STRIPE_PRICE_ID_YEARLY`.

---

## Related code

- Plans: `src/lib/plans.ts`, `src/lib/marketingPlans.ts`
- Signup: `src/server/auth.ts` (`startSignUp`), `src/app/signin/SignInForm.tsx`
- Billing: `src/server/billing.ts`, `src/app/household/_ui/plan.tsx` (`PlanSettingsCard`, upgrade dialog)
- SEO: `src/lib/pageMeta.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`
