// Renders PNG screenshot previews for each starter template and every widget type.
// Uses the real display bundle + sample feeds (scripts/template-samples/), not a CSS mock.
// Usage: npm run templates:previews
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import qrcode from "qrcode-generator";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "templates");
const widgetOutDir = join(root, "public", "features", "widgets");
const samplesDir = join(outDir, "samples");
const bundled = join(root, "node_modules", ".cache", "template-preview-data.mjs");
// Match the UC-Display21 (1920 × 1080). Container-query breakpoints in display.css are tuned for
// that size; a 720p viewport makes 2-row tiles look "short" and blows up sun / weather fonts.
const WIDTH = 1920;
const HEIGHT = 1080;
/** Pixels per grid cell for single-widget marketing samples. */
const CELL = 160;

mkdirSync(dirname(bundled), { recursive: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(widgetOutDir, { recursive: true });

// Display assets (JS/CSS/fonts) must be current.
const built = spawnSync(process.execPath, ["scripts/build-display.mjs"], { cwd: root, encoding: "utf8" });
if (built.status !== 0) {
  console.error(built.stdout || built.stderr || "build-display failed");
  process.exit(built.status ?? 1);
}

await esbuild.build({
  entryPoints: [join(root, "scripts", "template-preview-data.ts")],
  outfile: bundled,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  logLevel: "silent",
});

const { FIXED_NOW, SAMPLE_FEEDS, TEMPLATE_PREVIEWS, WIDGET_PREVIEWS, displayShell } = await import(pathToFileURL(bundled).href);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
};

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function readSample(name) {
  const file = join(samplesDir, name);
  if (!existsSync(file)) throw new Error(`Missing sample asset: ${name}`);
  return readFileSync(file);
}

function feedFor(pathname) {
  const m = pathname.match(/^\/api\/display\/([^/?]+)/);
  if (!m) return null;
  const key = m[1];
  if (key === "state") return null;
  if (key.startsWith("quotes")) return SAMPLE_FEEDS.quotes;
  if (key.startsWith("dad-joke"))
    return { updatedAt: FIXED_NOW, joke: "Why did the scarecrow win an award? He was outstanding in his field." };
  if (key.startsWith("rss")) return SAMPLE_FEEDS.rss;
  if (key.startsWith("trello")) return SAMPLE_FEEDS.trello;
  if (key.startsWith("slack")) return SAMPLE_FEEDS.slack;
  return SAMPLE_FEEDS[key] ?? null;
}

function serveStatic(urlPath, res) {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? urlPath);
  const file = join(root, "public", clean.replace(/^\//, ""));
  if (!file.startsWith(join(root, "public")) || !existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(file));
}

const previews = new Map([...TEMPLATE_PREVIEWS, ...WIDGET_PREVIEWS].map((t) => [t.id, t]));

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const { pathname, searchParams } = url;

  if (pathname === "/" || pathname.startsWith("/preview/")) {
    const id = pathname === "/" ? searchParams.get("id") : pathname.split("/")[2];
    const t = previews.get(id ?? "");
    if (!t) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("unknown template");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(displayShell({ templateId: t.id, mode: t.mode, assetVersion: "preview" }));
    return;
  }

  if (
    pathname.startsWith("/display/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/templates/samples/") ||
    pathname.startsWith("/brand/")
  ) {
    serveStatic(pathname, res);
    return;
  }

  if (pathname.startsWith("/api/display/state")) {
    const view = searchParams.get("view");
    const t = previews.get(view ?? "");
    if (!t) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown view" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(t.payload));
    return;
  }

  // Exact /photo (singular) — must not catch the /photos feed.
  if (/^\/api\/display\/photo\/?$/.test(pathname)) {
    const id = searchParams.get("i") ?? "";
    const file = join(samplesDir, `${id}.jpg`);
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("missing photo");
      return;
    }
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
    return;
  }

  if (pathname.startsWith("/api/display/camera")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(readSample("camera-door.svg"));
    return;
  }

  if (pathname.startsWith("/api/display/drivebc/image")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(readSample("highway-cam.svg"));
    return;
  }

  if (pathname.startsWith("/api/display/art")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(readSample("album-art.svg"));
    return;
  }

  if (pathname.startsWith("/api/display/qr")) {
    const view = searchParams.get("view");
    const widgetId = searchParams.get("w");
    const t = previews.get(view ?? "");
    const widget =
      t?.payload.views[0]?.widgets.find((w) => w.id === widgetId) ??
      t?.payload.views[0]?.widgets.find((w) => w.type === "wifiQr" || w.type === "editQr");
    let text = "WIFI:T:WPA;S:MapleStreetWiFi;P:come-on-in-2026;;";
    if (widget?.type === "wifiQr") {
      text = `WIFI:T:${widget.encryption};S:${widget.ssid};P:${widget.password};;`;
    } else if (widget?.type === "editQr") {
      text = "https://www.everydaypane.com/d/sampletok/edit/";
    }
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(qrSvg(text));
    return;
  }

  if (pathname.startsWith("/api/display/radar/tile")) {
    const style = searchParams.get("s") ?? "light";
    const name = style.includes("labels") ? "radar-labels.svg" : style.startsWith("dark") ? "radar-tile-dark.svg" : "radar-tile.svg";
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(readSample(name));
    return;
  }

  if (pathname.startsWith("/api/display/radar/frame")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(readSample("radar-frame.svg"));
    return;
  }

  if (pathname.startsWith("/api/display/")) {
    const data = feedFor(pathname);
    if (!data) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no sample feed" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const chromeGuess =
  process.env.CHROMIUM_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const browser = await chromium.launch(chromeGuess ? { executablePath: chromeGuess } : {});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

// Framed third-party sites: serve a local stand-in so CI needs no outbound net.
await page.route("**/*nullschool.net/**", async (route) => {
  route.fulfill({
    status: 200,
    contentType: "text/html",
    body: readSample("earth.html"),
  });
});
await page.route("**/embed.windy.com/**", async (route) => {
  route.fulfill({
    status: 200,
    contentType: "text/html",
    body: readSample("windy.html"),
  });
});
await page.route(/tradingview\.com|youtube\.com|youtu\.be|vimeo\.com|google\.com\/maps|maps\.google\.|instagram\.com/, async (route) => {
  route.fulfill({
    status: 200,
    contentType: "text/html",
    body: readSample("embed.html"),
  });
});

// The internet widget measures from the browser: leave Cloudflare unanswered (its pings time out after the shot) and
// seed the widget's saved readings instead, so the sample shows a steady line and a recent speed test.
await page.route("**/speed.cloudflare.com/**", () => new Promise(() => undefined));
await page.addInitScript((now) => {
  const ms = [14, 13, 15, 12, 14, 18, 13, 12, 14, 16, 13, 12, 22, 14, 13, 12, 15, 14, 13, 12, 14, 13, 17, 13, 12, 14, 13, 15, 12, 13];
  const history = ms.map((m, i) => ({ at: now - (ms.length - i) * 30_000, ms: i === 12 ? null : m }));
  const speed = { at: now - 47 * 60_000, down: 312.4, up: 48.6 };
  try {
    localStorage.setItem("everydaypane.internet.internet", JSON.stringify({ history, speed }));
  } catch {
    // Preview still renders, just empty.
  }
}, FIXED_NOW);
await page.clock.install({ time: FIXED_NOW });
// Stable photo shuffle / any other Math.random use across CI runs.
await page.addInitScript(() => {
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
});

async function settlePreview(payload) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.waitForSelector(".stage .cell", { timeout: 15_000 });
  // Hide the admin preview Day/Night chip so marketing and template thumbs stay clean.
  await page.addStyleTag({ content: ".preview-mode{display:none!important}" });
  await page.waitForTimeout(1800);
  if (payload.views[0]?.widgets.some((w) => w.type === "photos")) {
    await page
      .waitForFunction(() => [...document.querySelectorAll(".ph-slide.on .ph-img")].some((img) => img.naturalWidth > 0), null, {
        timeout: 8_000,
      })
      .catch(() => undefined);
  }
}

for (const t of TEMPLATE_PREVIEWS) {
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.goto(`${base}/preview/${t.id}/`, { waitUntil: "networkidle" });
  await settlePreview(t.payload);
  const file = join(outDir, `${t.id}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log(`wrote public/templates/${t.id}.png`);
}

for (const t of WIDGET_PREVIEWS) {
  const width = Math.max(CELL * t.cols, 280);
  const height = Math.max(CELL * t.rows, 200);
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/preview/${t.id}/`, { waitUntil: "networkidle" });
  await settlePreview(t.payload);
  const file = join(widgetOutDir, `${t.type}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log(`wrote public/features/widgets/${t.type}.png`);
}

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    TEMPLATE_PREVIEWS.map((t) => ({ id: t.id, name: t.name, file: `${t.id}.png` })),
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(widgetOutDir, "manifest.json"),
  JSON.stringify(
    WIDGET_PREVIEWS.map((t) => ({ type: t.type, name: t.name, file: `${t.type}.png` })),
    null,
    2,
  ) + "\n",
);

await browser.close();
server.close();
console.log(`Rendered ${TEMPLATE_PREVIEWS.length} template previews and ${WIDGET_PREVIEWS.length} widget samples.`);
