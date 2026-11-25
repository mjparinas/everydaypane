// The display's size budget (AGENTS.md "Display: super lightweight"): fails CI if it grows past it.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Melvin, 2026-11-23: CSS budget 10 → 20 KB so flip/nixie/word clock styles and display polish fit without starving the rest.
// Melvin, 2026-11-25: script budget 40 → 80 KB ("double the size of the limit").
const BUDGET = {
  "public/display/display.js": 80_000,
  "public/display/display.css": 20_000,
  "public/display/sw.js": 6_000,
  "public/display/ecoflow.js": 6_000,
  "public/display/internet.js": 6_000,
  "public/display/unifi.js": 6_000,
  "public/display/whiteboard.js": 6_000,
  "public/display/wildfires.js": 6_000,
  "public/display/windy.js": 6_000,
  "public/display/haEntity.js": 6_000,
  "public/display/oura.js": 6_000,
};
let failed = false;
for (const [file, max] of Object.entries(BUDGET)) {
  const size = gzipSync(readFileSync(file)).length;
  const ok = size <= max;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${(size / 1000).toFixed(1)} KB gzipped (budget ${max / 1000} KB)`);
}
if (failed) process.exit(1);
