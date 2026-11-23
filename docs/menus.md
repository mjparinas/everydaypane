# Nutrislice school menus

Household only. The **School menu** widget loads published breakfast and lunch from Nutrislice — it does **not** write into the meal plan table.

## Settings

**Settings › Menus**:

- **District slug** — subdomain on `*.api.nutrislice.com` (e.g. Langley: `langleysd35`).
- **Default school slug** — school segment from the district's Nutrislice URL.

## Widget

- **School slug** overrides the default when set.
- **Days** — today or up to a week.
- **Breakfast / lunch** toggles.

Menus are cached for 30 minutes. Dinner is not offered unless Nutrislice exposes it on the same JSON shape; use the family meal plan for dinner at home.