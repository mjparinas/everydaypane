// Builds the display (src/display/) into public/display/ with esbuild: one minified ES module, the service worker and
// the stylesheet, plus the self-hosted fonts into public/fonts/. Runs before `next dev` and `next build`.
// Pass --watch to rebuild on change.
import { copyFileSync, mkdirSync } from "node:fs";
import * as esbuild from "esbuild";

mkdirSync("public/display", { recursive: true });
mkdirSync("public/fonts", { recursive: true });
for (const [pkg, file, out] of [
  ["inter", "inter-latin-wght-normal.woff2", "inter.woff2"],
  ["manrope", "manrope-latin-wght-normal.woff2", "manrope.woff2"],
  ["space-grotesk", "space-grotesk-latin-wght-normal.woff2", "space-grotesk.woff2"],
]) {
  copyFileSync(`node_modules/@fontsource-variable/${pkg}/files/${file}`, `public/fonts/${out}`);
}

const common = {
  bundle: true,
  minify: true,
  // The UC-Display21 runs a recent Android WebView; Chrome 109 covers container queries and color-mix.
  target: ["chrome109", "safari16"],
  legalComments: "none",
  logLevel: "warning",
  tsconfig: "tsconfig.json",
};

const builds = [
  { ...common, entryPoints: ["src/display/main.ts"], outfile: "public/display/display.js", format: "esm" },
  { ...common, entryPoints: ["src/display/sw.ts"], outfile: "public/display/sw.js", format: "iife" },
  {
    ...common,
    entryPoints: ["src/display/display.css"],
    outfile: "public/display/display.css",
    loader: { ".woff2": "empty" },
    external: ["/fonts/*", "/brand/*"],
  },
];

if (process.argv.includes("--watch")) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  console.log("Watching src/display/");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
