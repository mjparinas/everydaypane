---
name: Everydaypane
description: Soft indigo kitchen glass — glanceable family hub chrome for marketing, household, and email.
colors:
  brand: "#3b5bdb"
  brand-ink: "#ffffff"
  brand-deep: "#2a3796"
  brand-mid: "#4c6ef5"
  ink: "#0f172a"
  soft: "#526077"
  bg: "#f6f7fb"
  panel: "#ffffff"
  line: "#e4e7ef"
  sun: "#f59e0b"
  sky: "#38bdf8"
  good: "#2b8a3e"
  bad: "#c92a2a"
  pane-bezel: "#0b1220"
  pane-shot: "#111827"
  brand-night: "#8ea2ff"
  bg-night: "#0a0e17"
  panel-night: "#121826"
  line-night: "#232c3f"
  ink-night: "#e8edf7"
  soft-night: "#97a3ba"
typography:
  display:
    fontFamily: "Manrope Variable, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Manrope Variable, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "0.75rem"
    letterSpacing: "0.2em"
rounded:
  control: "0.75rem"
  card: "1rem"
  banner: "1.5rem"
  bezel: "1.25rem"
  mark: "10px"
  pill: "999px"
spacing:
  control-y: "2.75rem"
  card: "1.25rem"
  page-x: "1rem"
  site-max: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "{spacing.control-y}"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "{spacing.control-y}"
  button-cta-on-banner:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.brand}"
    rounded: "{rounded.card}"
    padding: "0 1.5rem"
    height: "3rem"
  field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "{spacing.control-y}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  nav-link:
    textColor: "{colors.soft}"
    rounded: "0.5rem"
    padding: "0.5rem 0.75rem"
---

# Design System: Everydaypane

<!-- impeccable:design-map -->
Name: Everydaypane
Colors: primary: brand #3b5bdb; secondary: sun #f59e0b; tertiary: good #2b8a3e; neutral: ink #0f172a; primary: brand-ink #ffffff; primary: brand-deep #2a3796; primary: brand-mid #4c6ef5 (+14 more in the sidecar)
Fonts: Manrope Variable (display, label); Inter Variable (body)
Spacing: control-y 2.75rem, card 1.25rem, page-x 1rem, site-max 72rem
Radius: control 0.75rem, card 1rem, banner 1.5rem, bezel 1.25rem, mark 10px, pill 999px
North Star: "Kitchen Glass Pane"
Rules:
- The One Pane Rule. Kitchen Indigo is the single brand voice on a screen; do not introduce a second primary accent for “interest.”
- The Paper Rule. Page chrome sits on Cool Paper + Panel White with Hairline borders — not pure white full-bleed or cream lifestyle paper.
- The Wordmark Rule. Product name is Everydaypane; the mark paints everydaypane with “pane” in Kitchen Indigo (or sun-on-indigo in inverted email headers).
- The Two-Family Rule. Marketing/display voice = Manrope; operational UI body = Inter.
- The Wall Floor Rule. No wall text under 16 px (`--t-meta`), secondary lines at least 18 px (`--t-small`); lists fill their tile and hide whole rows that don't fit (`fillTile`, `dropOverflow`). Design review, Melvin, 2026-11-26.
- The Phone Reach Rule. Household and family controls keep ≥44px-class hit areas; do not shrink primary actions for desktop density alone.
- The Flat-By-Default Rule. Surfaces stay flat at rest.
- The Soft Corner Rule. Prefer xl/2xl radii from the token scale; avoid sharp rectangles and full-pill primary buttons (pills are for indicators, not CTAs).
- The Shared Utility Rule. Prefer `btn` / `btn-primary` / `btn-ghost` / `field` / `card` from `globals.css` over one-off Tailwind stacks for the same jobs.
Elevation:
- Card rest: shadow-sm
- Bezel lift: 0 24px 60px -28px rgb(15 23 42 / 0.45)
- Banner / CTA: shadow-lg
Don't:
- Don't restyle the wall with marketing `@theme` tokens — wall themes own that surface.
- Don't invent purple-on-white SaaS gradients, cream/serif lifestyle brochure looks, or dense broadsheet layouts for product chrome.
- Don't put personal family photos in OG, marketing, or template proof — use `public/templates/` / feature widget samples.
- Don't “fix” wall pinch-zoom locks; that exception is product policy, not a design bug.
- Don't add a second email template system — reuse `src/lib/email.ts` chrome.
Map: src/display/dom.ts
Map: public/brand/
Map: public/templates/
Map: src/lib/email.ts
Full: .impeccable/design-full.md (read a section when you need its detail)
