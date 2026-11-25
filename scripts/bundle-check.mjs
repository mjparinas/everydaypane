// The display's size budget (AGENTS.md "Display: super lightweight"): fails CI if it grows past it.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Script 40 → 42 KB (2026-11-25) for the wildfire map: the display was already at 39.9 KB, so no new widget fit.
// Melvin, 2026-11-23: CSS budget 10 → 20 KB so flip/nixie/word clock styles and display polish fit without starving the rest.
const BUDGET = { "public/display/display.js": 42_000, "public/display/display.css": 20_000, "public/display/sw.js": 6_000 };
let failed = false;
for (const [file, max] of Object.entries(BUDGET)) {
  const size = gzipSync(readFileSync(file)).length;
  const ok = size <= max;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${(size / 1000).toFixed(1)} KB gzipped (budget ${max / 1000} KB)`);
}
if (failed) process.exit(1);
