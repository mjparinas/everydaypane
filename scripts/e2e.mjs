// Browser tests against a production build (`npm run build` first). Starts `next start` itself on a fresh database,
// signs in through the real magic link (printed by the server when RESEND_API_KEY is unset), and checks each flow.
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

async function lastLink(email) {
  for (let i = 0; i < 20; i++) {
    const matches = [...log.matchAll(new RegExp(`To ${email.replace(".", "\\.")}:[\\s\\S]*?(http\\S+token=\\S+)`, "g"))];
    const link = matches.at(-1)?.[1];
    if (link) return link.replace(/^https?:\/\/[^/]+/, BASE);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("No sign-in link was printed");
}

export async function signIn(page, email) {
  await page.goto(`${BASE}/admin/`);
  await page.waitForURL(/\/signin\//);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await page.getByRole("status").waitFor();
  await page.goto(await lastLink(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}

try {
  await waitForServer();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await step("health check answers", async () => {
    const r = await fetch(`${BASE}/api/health/`);
    expect(r.ok, `status ${r.status}`);
    expect(r.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "missing CSP");
  });

  await step("admin signs in with a magic link", async () => {
    await signIn(page, "admin@example.com");
    await page.waitForURL(/\/admin\//);
    await page.getByText("admin@example.com").waitFor();
  });

  await step("a used link can't sign in again", async () => {
    const link = await lastLink("admin@example.com");
    const other = await browser.newPage();
    await other.goto(link);
    await other.getByRole("button", { name: "Sign in" }).click();
    await other.getByText("That link has expired").waitFor();
    await other.close();
  });

  await step("admin API refuses people who aren't signed in", async () => {
    const r = await fetch(`${BASE}/api/admin/config/`);
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
