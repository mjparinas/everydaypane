// Renders PNG screenshot previews for each starter template into public/templates/.
// Usage: npm run templates:previews
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "templates");
const bundled = join(root, "node_modules", ".cache", "template-preview-data.mjs");

mkdirSync(dirname(bundled), { recursive: true });
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "scripts", "template-preview-data.ts")],
  outfile: bundled,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  logLevel: "silent",
});

const { PREVIEW_DATA } = await import(pathToFileURL(bundled).href);

const WIDTH = 960;
const HEIGHT = 540;

function htmlFor(t) {
  const c = t.colours;
  const cells = t.widgets
    .map((w) => {
      const lines = w.sample.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join("");
      const photo = w.type === "photos" || w.type === "radar" || w.type === "earth" || w.type === "camera";
      const noPanel = !w.showBackground;
      const backdrop = w.type === "photos" && w.w >= 10 && w.h >= 6;
      const head = backdrop
        ? ""
        : `<div class="head"><span class="icon">${w.icon}</span><span class="label">${escapeHtml(w.label)}</span></div>`;
      return `<div class="cell ${photo ? "photo" : ""} ${noPanel ? "bare" : ""} ${backdrop ? "backdrop" : ""}" style="grid-column:${w.x + 1}/span ${w.w};grid-row:${w.y + 1}/span ${w.h}">
        ${head}
        <div class="body">${lines}</div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; }
  .stage {
    width: 100%; height: 100%;
    background: linear-gradient(145deg, ${c.background}, ${c.backgroundTo});
    color: ${c.text};
    display: grid;
    grid-template-columns: repeat(${t.cols}, minmax(0, 1fr));
    grid-template-rows: repeat(${t.rows}, minmax(0, 1fr));
    gap: ${Math.max(6, Math.round(t.gap / 2))}px;
    padding: ${Math.max(8, Math.round(t.padding / 2))}px;
  }
  .cell {
    position: relative;
    border-radius: ${Math.max(10, Math.round(t.radius / 2))}px;
    background: color-mix(in srgb, ${c.surface} ${Math.round(c.surfaceOpacity * 100)}%, transparent);
    box-shadow: 0 1px 0 rgba(255,255,255,0.35) inset, 0 8px 18px rgba(15,23,42,0.06);
    padding: 10px 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    min-height: 0;
  }
  .cell.photo {
    z-index: 0;
    background:
      linear-gradient(160deg, color-mix(in srgb, ${c.accent} 35%, #1e293b), color-mix(in srgb, ${c.muted} 45%, #0f172a));
    color: #f8fafc;
    justify-content: flex-end;
  }
  .cell:not(.photo) { z-index: 1; }
  .cell.bare {
    background: transparent;
    box-shadow: none;
    padding: 4px 6px;
  }
  .head { display: flex; align-items: center; gap: 6px; opacity: 0.92; }
  .icon { font-size: 14px; line-height: 1; }
  .label { font-size: 11px; font-weight: 650; letter-spacing: 0.01em; color: inherit; opacity: 0.85; }
  .cell.bare .label { text-shadow: 0 1px 4px rgba(0,0,0,0.35); }
  .body { display: flex; flex-direction: column; gap: 3px; min-height: 0; flex: 1; }
  .line {
    font-size: 13px; font-weight: 600; line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .line:first-child { font-size: 18px; font-weight: 750; }
  .cell.photo .line:first-child { font-size: 15px; opacity: 0.9; }
</style></head>
<body><div class="stage">${cells}</div></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const chromeGuess =
  process.env.CHROMIUM_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const browser = await chromium.launch(chromeGuess ? { executablePath: chromeGuess } : {});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });

for (const t of PREVIEW_DATA) {
  await page.setContent(htmlFor(t), { waitUntil: "load" });
  const file = join(outDir, `${t.id}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log(`wrote public/templates/${t.id}.png`);
}

// Tiny manifest so the gallery can sanity-check previews exist in tests without reading PNGs.
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    PREVIEW_DATA.map((t) => ({ id: t.id, name: t.name, file: `${t.id}.png` })),
    null,
    2,
  ) + "\n",
);

await browser.close();
console.log(`Rendered ${PREVIEW_DATA.length} template previews.`);
