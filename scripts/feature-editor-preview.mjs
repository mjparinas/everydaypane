// The "Live household editor" picture on /features/ (Melvin, 2026-11-27: screenshots on every Display Behaviour card).
// The household panel is a Next.js page, so unlike `npm run templates:previews` this needs a production build
// (`npm run build` first). It starts `next start` on a fresh database with AUTH_TEST_MODE, puts the Kitchen Glance
// starter template on the household's first view, answers the live preview's feeds with the template samples and
// writes public/features/live-editor.png. Usage: node scripts/feature-editor-preview.mjs
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE = `http://localhost:${PORT}`;
const DB = join(root, "feature-editor.db");
rmSync(DB, { force: true });

const bundled = join(root, "node_modules", ".cache", "template-preview-data.mjs");
await esbuild.build({
  entryPoints: [join(root, "scripts", "template-preview-data.ts")],
  outfile: bundled,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  logLevel: "silent",
});
const { FIXED_NOW, SAMPLE_FEEDS, TEMPLATE_PREVIEWS } = await import(pathToFileURL(bundled).href);

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: `file:${DB}`,
    SESSION_SECRET: "feature-editor-secret-0123456789abcdef0123",
    ADMIN_EMAILS: "admin@example.com",
    RESEND_API_KEY: "",
    AUTH_TEST_MODE: "1",
    CLERK_SECRET_KEY: "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    NODE_ENV: "production",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/api/health/`)).ok) break;
    } catch {}
    if (i > 60) throw new Error(`Server didn't start:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
  await page.clock.install({ time: FIXED_NOW });

  // The live preview is the real wall in an iframe: answer its feeds with the same samples as the template pictures.
  await page.route(/\/api\/display\/(?!state)([^/?]+)/, async (route) => {
    const key = new URL(route.request().url()).pathname.split("/")[3] ?? "";
    if (key === "photo") {
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        path: join(root, "public/templates/samples", `${new URL(route.request().url()).searchParams.get("i")}.jpg`),
      });
    }
    const data = SAMPLE_FEEDS[key];
    if (!data) return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });

  await page.goto(`${BASE}/household/`);
  await page.waitForURL(/\/signin\//);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/household\//);

  // Kitchen Glance on the first view, so the editor shows a full wall.
  const { config, version } = await (await page.request.get(`${BASE}/api/household/config/`)).json();
  const glance = TEMPLATE_PREVIEWS.find((t) => t.id === "kitchen-glance").payload.views[0];
  const first = config.views[0];
  Object.assign(first, {
    cols: glance.cols,
    rows: glance.rows,
    gap: glance.gap,
    padding: glance.padding,
    tilePadding: glance.tilePadding,
    widgets: glance.widgets,
  });
  const saved = await page.request.put(`${BASE}/api/household/config/`, {
    headers: { origin: BASE },
    data: { baseVersion: version, config },
  });
  if (!saved.ok()) throw new Error(`save: ${saved.status()} ${await saved.text()}`);

  await page.goto(`${BASE}/household/#views`);
  const frame = page.frameLocator("iframe").first();
  await frame.locator(".stage .cell").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  // Point at the weather tile, so the shot shows the outline and the corner handles used to move and resize it.
  await page.getByRole("button", { name: /^Weather, / }).hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(root, "public", "features", "live-editor.png"), type: "png" });
  console.log("wrote public/features/live-editor.png");
  await browser.close();
} finally {
  server.kill();
  rmSync(DB, { force: true });
}
