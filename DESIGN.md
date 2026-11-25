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

## Overview

**Creative North Star: "Kitchen Glass Pane"**

Everydaypane’s product chrome (marketing site, household panel, family phone flows, sign-in, and outbound email) reads like a calm pane of kitchen glass: soft paper backgrounds, white panels, and a rare indigo accent that names the brand without shouting. Density stays practical — phone-first controls with comfortable tap targets — never gadget-dark neon or brochure-lifestyle cream.

The wall display is a separate visual layer: households pick themes (Aurora, Mist, Forest, …), fonts, radius, and glass opacity. That layer inherits glanceability and Canadian English, but not the marketing token sheet. New marketing or household UI extends this system; new wall chrome follows the active theme tokens in `display.css`, not these page tokens.

**Key Characteristics:**
- Soft indigo brand on cool paper (`#f6f7fb`), not purple SaaS gradients
- Manrope for display/wordmark; Inter for UI body
- Flat panels with hairline borders; lift reserved for device mock and CTA banners
- Refined rounded controls (`rounded-xl`) and cards (`rounded-2xl`)
- Wordmark: everyday**pane** with “pane” in brand blue

## Colors

Cool paper neutrals with one indigo voice; amber and sky appear as secondary warmth on marketing washes and the mark’s sun pane.

### Primary
- **Kitchen Indigo** (`{colors.brand}`): Wordmark “pane”, primary buttons, focus rings, eyebrows, theme/viewport chrome. Keep rare on dense admin screens — CTAs and identity, not decoration.
- **Brand Ink** (`{colors.brand-ink}`): Text on primary fills.
- **Indigo Deep** (`{colors.brand-deep}`): Email/header depth; darker brand moments.
- **Indigo Mid** (`{colors.brand-mid}`): Gradient midpoint on CTA banners (`from-brand via… to-amber`).

### Secondary
- **Sun Amber** (`{colors.sun}`): Mark’s sun pane, marketing radial wash, CTA banner end stop, warm highlights.
- **Sky Cyan** (`{colors.sky}`): Light accent (weather-adjacent marketing cues); use sparingly.

### Tertiary
- **Good Green** (`{colors.good}`): Success checks, positive status.
- **Alert Red** (`{colors.bad}`): Errors and destructive status (wall emergency strip is a separate display concern).

### Neutral
- **Cool Paper** (`{colors.bg}`): Page background; email page wash.
- **Panel White** (`{colors.panel}`): Cards, fields, sticky header fill.
- **Slate Ink** (`{colors.ink}`): Primary text.
- **Soft Slate** (`{colors.soft}`): Secondary text, nav idle.
- **Hairline** (`{colors.line}`): Borders and dividers.
- **Pane Bezel / Shot** (`{colors.pane-bezel}`, `{colors.pane-shot}`): Marketing device mock chassis and screenshot well.

### Night (prefers-color-scheme)
Dark marketing/admin tokens flip paper to night navy (`{colors.bg-night}` … `{colors.soft-night}`) and lift brand to `{colors.brand-night}` so indigo stays legible on dark panels.

### Named Rules
**The One Pane Rule.** Kitchen Indigo is the single brand voice on a screen; do not introduce a second primary accent for “interest.”
**The Paper Rule.** Page chrome sits on Cool Paper + Panel White with Hairline borders — not pure white full-bleed or cream lifestyle paper.
**The Wall Is Not This Sheet.** Do not apply marketing `@theme` colours to wall widgets; wall colour comes from the household’s chosen theme.

## Typography

**Display Font:** Manrope Variable (ui-sans-serif fallback)
**Body Font:** Inter Variable (system UI fallback)
**Label/Mono Font:** Manrope for marketing eyebrows; no dedicated mono in product chrome

**Character:** Manrope carries the wordmark and hero weight (extrabold, tight tracking); Inter keeps household forms and tables readable at phone density.

### Hierarchy
- **Display** (Manrope 800, tracking tight ≈ `-0.02em`): Wordmark, hero/CTA titles, section titles on marketing.
- **Headline** (Manrope ~2xl–3xl extrabold): Banner and feature headings.
- **Title** (Manrope/Inter semibold): Card and footer column titles.
- **Body** (Inter regular, soft for secondary): Paragraphs, form labels’ companion text; keep line length comfortable (~60–75ch on reading pages).
- **Label** (Manrope bold, `0.75rem`, `0.2em` tracking, uppercase): Eyebrows only — sparse.

### Named Rules
**The Wordmark Rule.** Product name is Everydaypane; the mark paints everyday**pane** with “pane” in Kitchen Indigo (or sun-on-indigo in inverted email headers). Do not invent EverydayPane / Everyday Pane in UI chrome.
**The Two-Family Rule.** Marketing/display voice = Manrope; operational UI body = Inter. Wall themes may swap Inter for Outfit, DM Sans, Literata, Space Grotesk — that choice stays on the wall.

## Layout

Marketing and household share a **max-width 6xl (~72rem)** content column with **1rem** page gutters. Site background is Cool Paper plus soft brand/sun radials (not a flat slab). Sticky header uses frosted paper (`bg/90` + backdrop blur). Cards and lists favour phone-first stacking; tap targets stay at least **2.75rem** tall (`min-h-11`).

Wall layout is a separate grid (default **12×8** landscape, **8×12** portrait) with gap/edge/tile padding owned by the view — document wall geometry in product rules, not as marketing spacing tokens.

### Named Rules
**The Phone Reach Rule.** Household and family controls keep ≥44px-class hit areas; do not shrink primary actions for desktop density alone.

## Elevation & Depth

Mostly **flat / tonal**: panels are white (or night panel) with hairline borders and optional `shadow-sm` on cards. True lift is reserved for the marketing **pane bezel** mock (`0 24px 60px -28px` slate shadow) and CTA banners (`shadow-lg`). Sticky header depth comes from blur + border, not a heavy drop shadow.

### Shadow Vocabulary
- **Card rest** (`shadow-sm`): Default card.
- **Bezel lift** (`0 24px 60px -28px rgb(15 23 42 / 0.45)` + inset hairline): Device mock only.
- **Banner / CTA** (`shadow-lg` / `shadow-md` on white CTA chip): Marketing persuasion moments.

### Named Rules
**The Flat-By-Default Rule.** Surfaces stay flat at rest. Shadows appear for device theatre or primary persuasion — not under every admin card.

## Shapes

Gently curved product chrome: **0.75rem** on buttons/fields, **1rem** on cards, **1.5rem** on large banners, **1.25rem** on the pane bezel, **10px** on the mark tile, pills only for chrome dots. Borders are 1px Hairline; focus uses brand border + `ring-2 ring-brand/30`.

### Named Rules
**The Soft Corner Rule.** Prefer xl/2xl radii from the token scale; avoid sharp rectangles and full-pill primary buttons (pills are for indicators, not CTAs).

## Components

### Buttons
- **Shape:** Soft rectangle (`rounded-xl` / `{rounded.control}`), min-height 2.75rem, semibold label, `active:scale-[0.98]`.
- **Primary:** Kitchen Indigo fill, brand-ink text; hover brightens (`brightness-110`).
- **Ghost:** Panel fill, Hairline border; hover Cool Paper.
- **CTA on banner:** White chip, brand text, larger radius (`rounded-2xl`), stronger shadow — only on indigo→amber banners.
- **Focus:** Visible brand ring; never remove outlines for aesthetics.

### Cards / Containers
- **Corner Style:** `rounded-2xl`
- **Background:** Panel White
- **Border:** Hairline
- **Shadow Strategy:** `shadow-sm` at rest (Flat-By-Default)
- **Internal Padding:** `1.25rem` (`p-5`)

### Inputs / Fields
- **Style:** Panel fill, Hairline border, `rounded-xl`, min-height 2.75rem
- **Focus:** Brand border + translucent brand ring
- **Disabled:** 50% opacity via shared control treatment

### Navigation
- Sticky frosted header; idle Soft Slate links; hover Panel + Ink
- Primary nav CTA uses `btn-primary`
- Footer: panel-tinted band, semibold column titles, soft link list

### Signature: Pane mock
Marketing device frame — dark bezel, traffic-light dots, rounded screenshot well. Used to show real template/widget previews without personal photos.

### Signature: Wordmark / Mark
Rounded indigo mark (three panes: clock, sun, pale) + Manrope everyday**pane**. Sources in `public/brand/`.

### Named Rules
**The Shared Utility Rule.** Prefer `btn` / `btn-primary` / `btn-ghost` / `field` / `card` from `globals.css` over one-off Tailwind stacks for the same jobs.

## Do's and Don'ts

### Do:
- **Do** keep Kitchen Indigo as the sole primary accent on product chrome.
- **Do** set everyday**pane** with “pane” in brand blue on light surfaces.
- **Do** use Manrope for marketing/display voice and Inter for operational body UI.
- **Do** honour `prefers-reduced-motion` (disable `site-rise`; solid states for alarms on the wall).
- **Do** use Canadian English in UI copy (colour, centre, favourite).

### Don't:
- **Don't** restyle the wall with marketing `@theme` tokens — wall themes own that surface.
- **Don't** invent purple-on-white SaaS gradients, cream/serif lifestyle brochure looks, or dense broadsheet layouts for product chrome.
- **Don't** put personal family photos in OG, marketing, or template proof — use `public/templates/` / feature widget samples.
- **Don't** “fix” wall pinch-zoom locks; that exception is product policy, not a design bug.
- **Don't** add a second email template system — reuse `src/lib/email.ts` chrome.
