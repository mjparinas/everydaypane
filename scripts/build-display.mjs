// Builds the display (src/display/) into public/display/ with esbuild: one minified ES module, the service worker and
// the stylesheet, plus the self-hosted fonts into public/fonts/. Runs before `next dev` and `next build`.
// Pass --watch to rebuild on change.
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as esbuild from "esbuild";

mkdirSync("public/display", { recursive: true });
mkdirSync("public/fonts", { recursive: true });
for (const [pkg, file, out] of [
  ["inter", "inter-latin-wght-normal.woff2", "inter.woff2"],
  ["manrope", "manrope-latin-wght-normal.woff2", "manrope.woff2"],
  ["space-grotesk", "space-grotesk-latin-wght-normal.woff2", "space-grotesk.woff2"],
  ["outfit", "outfit-latin-wght-normal.woff2", "outfit.woff2"],
  ["dm-sans", "dm-sans-latin-wght-normal.woff2", "dm-sans.woff2"],
  ["literata", "literata-latin-wght-normal.woff2", "literata.woff2"],
]) {
  copyFileSync(`node_modules/@fontsource-variable/${pkg}/files/${file}`, `public/fonts/${out}`);
}

const common = {
  bundle: true,
  minify: true,
  // Kitchen wall panels often run a recent Android WebView; Chrome 109 covers container queries and color-mix.
  target: ["chrome109", "safari16"],
  legalComments: "none",
  logLevel: "warning",
  tsconfig: "tsconfig.json",
};

// Widgets built as their own file (src/display/widgets/lazy.ts). Their ../api is apiShared.ts, which uses
// display.js's copy, so there is one set of feeds and one device token.
const LAZY = ["ecoflow", "internet", "unifi", "whiteboard", "wildfires", "windy", "haEntity", "oura", "airthings", "laundry"];
const sharedApi = {
  name: "shared-api",
  setup(build) {
    build.onResolve({ filter: /^\.\.\/api$/ }, () => ({ path: resolve("src/display/apiShared.ts") }));
  },
};

const builds = [
  { ...common, entryPoints: ["src/display/main.ts"], outfile: "public/display/display.js", format: "esm" },
  // Widgets that load only on a screen that shows them (src/display/widgets/lazy.ts).
  ...LAZY.map((name) => ({
    ...common,
    entryPoints: [`src/display/widgets/${name}.ts`],
    outfile: `public/display/${name}.js`,
    format: "esm",
    plugins: [sharedApi],
  })),
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
