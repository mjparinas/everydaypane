// The display's size budget (AGENTS.md "Display: super lightweight"): fails CI if it grows past it.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = { "public/display/display.js": 40_000, "public/display/display.css": 10_000, "public/display/sw.js": 6_000 };
let failed = false;
for (const [file, max] of Object.entries(BUDGET)) {
  const size = gzipSync(readFileSync(file)).length;
  const ok = size <= max;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${(size / 1000).toFixed(1)} KB gzipped (budget ${max / 1000} KB)`);
}
if (failed) process.exit(1);
