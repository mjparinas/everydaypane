// Browser tests against a production build (`npm run build` first). Starts `next start` itself on a fresh database,
// signs in through AUTH_TEST_MODE (no Clerk keys required in CI), and checks each flow.
// Any console error fails the run. Usage: node scripts/e2e.mjs
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const DB = process.env.DATABASE_URL ?? "file:e2e.db";
if (DB.startsWith("file:")) rmSync(DB.slice(5), { force: true });

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    DATABASE_URL: DB,
    SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123",
    ADMIN_EMAILS: "admin@example.com",
    FAMILY_EMAILS: "kid@example.com",
    RESEND_API_KEY: "",
    AUTH_TEST_MODE: "1",
    // Leave Clerk unset so proxy uses the test cookie gate.
    CLERK_SECRET_KEY: "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    // Match CI build: absolute icon/OG URLs must hit this server, not a stale production host.
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? BASE,
    NODE_ENV: "production",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

const failures = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`✗ ${name}\n  ${e instanceof Error ? e.message : String(e)}`);
  }
};
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server didn't start:\n${log}`);
}

export async function signIn(page, email) {
  await page.goto(`${BASE}/household/`);
  await page.waitForURL(/\/signin\//);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Sign in|Create free household|Email me a code/i }).click();
  // commit: the Views preview iframe can delay the load event past Playwright's default.
  await page.waitForURL(/\/household\//, { waitUntil: "commit" });
}

try {
  await waitForServer();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  // Weather and air come from Open-Meteo; CI without outbound net answers 502, which the display handles. The Views
  // live preview loads those routes in an iframe, and Chrome logs the 502 as a console error on this page.
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of 50[23]/.test(m.text())) return;
    consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await step("health check answers", async () => {
    const r = await fetch(`${BASE}/api/health/`);
    expect(r.ok, `status ${r.status}`);
    expect(r.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "missing CSP");
  });

  await step("the privacy policy is public (Google's consent screen links to it)", async () => {
    const r = await fetch(`${BASE}/privacy/`, { redirect: "manual" });
    expect(r.status === 200, `status ${r.status}`);
    expect((await r.text()).includes("calendar.readonly"), "missing the Google Calendar section");
  });

  await step("admin signs in with AUTH_TEST_MODE", async () => {
    await signIn(page, "admin@example.com");
    await page.waitForURL(/\/household\//);
    await page.getByText("admin@example.com").waitFor();
  });

  await step("test sign-in refuses unknown emails", async () => {
    const r = await fetch(`${BASE}/api/auth/test-signin/`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@example.com" }),
    });
    expect(r.status === 403, `status ${r.status}`);
  });

  await step("admin API refuses people who aren't signed in", async () => {
    const r = await fetch(`${BASE}/api/household/config/`);
    expect(r.status === 401, `status ${r.status}`);
  });

  for (const extra of (await import("./e2e-flows.mjs").catch(() => ({ flows: [] }))).flows ?? []) {
    await step(extra.name, () => extra.run({ browser, page, base: BASE, signIn, expect }));
  }

  await step("no console errors", async () => expect(consoleErrors.length === 0, consoleErrors.join("\n")));
  await browser.close();
} finally {
  server.kill();
}

if (failures.length) {
  console.error(`\nServer log:\n${log.slice(-4000)}\n${failures.length} failed`);
  process.exit(1);
}
