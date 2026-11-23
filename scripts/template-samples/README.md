# Template & widget preview sample data

JSON feeds and helpers used by `npm run templates:previews` to screenshot the **real** display widgets for each starter
template and every widget type on `/features/`.

- Edit these files to change what calendars, chores, meals, messages, weather, etc. show in `public/templates/*.png` and
  `public/features/widgets/<type>.png`.
- Sample photos and iframe stand-ins live in `public/templates/samples/` (JPEG + SVG placeholders for radar, camera,
  album art, earth, and embeds).
- Re-run locally with `npm run templates:previews`, or trigger the **Update template previews** GitHub Action.

Frozen wall time for every screenshot: **2026-11-23 15:42 America/Vancouver** (see `FIXED_NOW` in `scripts/template-preview-data.ts`).
