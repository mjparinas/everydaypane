// Display flows for scripts/e2e.mjs: add a device through the admin API, open its address like a wall screen would,
// and check it draws, ticks, polls for changes and survives going offline.

const VIEWPORT = { width: 1920, height: 1080 }; // the UC-Display21

async function addDevice(page, base, viewId = null) {
  const r = await page.request.post(`${base}/api/admin/devices/`, { headers: { origin: base }, data: { name: "Kitchen", viewId } });
  if (r.status() !== 201) throw new Error(`add device: ${r.status()}`);
  return (await r.json()).url.replace(/^https?:\/\/[^/]+/, base);
}

async function openDisplay(browser, url) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Weather and air come from Open-Meteo; a sandbox without internet answers 502, which the display handles.
  page.on("response", (r) => {
    if (r.status() >= 400 && !/\/api\/display\/(weather|air)\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(url);
  return { context, page, errors };
}

export const flows = [
  {
    name: "a display draws its view and the clock ticks",
    async run({ browser, page, base, expect }) {
      const url = await addDevice(page, base, "home");
      const d = await openDisplay(browser, url);
      await d.page.locator(".cell-clock .c-hm").first().waitFor();
      const cells = await d.page.locator(".cell").count();
      expect(cells === 9, `expected 9 widgets, saw ${cells}`);
      const first = await d.page.locator(".cell-clock").first().textContent();
      expect(first.includes("Vancouver"), "Vancouver clock label");
      const toronto = await d.page.locator(".cell-clock").nth(1).textContent();
      expect(toronto.includes("Toronto"), "Toronto clock label");
      // No sideways scroll on the 1920 × 1080 screen.
      const overflow = await d.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      );
      expect(!overflow, "page scrolls");
      expect(d.errors.length === 0, d.errors.join("\n"));
      await d.context.close();
    },
  },
  {
    name: "a display picks up admin changes by polling",
    async run({ browser, page, base, expect }) {
      const url = await addDevice(page, base, "home");
      const d = await openDisplay(browser, url);
      await d.page.locator(".cell").first().waitFor();
      const { config, version } = await (await page.request.get(`${base}/api/admin/config/`)).json();
      config.views
        .find((v) => v.id === "home")
        .widgets.push({ id: "e2e-note", type: "note", x: 4, y: 2, w: 2, h: 1, text: "Hello from the admin", size: "m" });
      config.views.find((v) => v.id === "home").widgets = config.views
        .find((v) => v.id === "home")
        .widgets.filter((w) => w.id !== "home-aq");
      const saved = await page.request.put(`${base}/api/admin/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(saved.ok(), `save: ${saved.status()} ${await saved.text()}`);
      await d.page.getByText("Hello from the admin").waitFor({ timeout: 40_000 });
      await d.context.close();
    },
  },
  {
    name: "a display keeps working offline",
    async run({ browser, page, base }) {
      const url = await addDevice(page, base, "night");
      const d = await openDisplay(browser, url);
      await d.page.locator(".cell-clock").waitFor();
      await d.page.evaluate(() => navigator.serviceWorker.ready);
      // Load once more so the service worker controls the page and has copies of everything.
      await d.page.reload();
      await d.page.locator(".cell-clock").waitFor();
      await d.page.waitForTimeout(500);
      await d.context.setOffline(true);
      await d.page.reload();
      await d.page.locator(".cell-clock .c-hm").waitFor({ timeout: 15_000 });
      await d.page.locator(".offline.show").waitFor({ timeout: 15_000 });
      await d.context.close();
    },
  },
  {
    name: "an unknown display address is refused",
    async run({ base, expect }) {
      const r = await fetch(`${base}/d/not-a-real-token-1234567890/`);
      expect(r.status === 404, `status ${r.status}`);
      const api = await fetch(`${base}/api/display/state/`, { headers: { "x-display-token": "not-a-real-token-1234567890" } });
      expect(api.status === 401, `api status ${api.status}`);
    },
  },
  {
    name: "the display bundle is small",
    async run({ base, expect }) {
      const html = await (await fetch(`${base}/api/health/`)).text();
      expect(html.includes("ok"), "health");
      const js = await fetch(`${base}/display/display.js`);
      const bytes = (await js.arrayBuffer()).byteLength;
      expect(bytes < 120_000, `display.js is ${bytes} bytes before gzip`);
    },
  },
  {
    name: "the admin panel resizes a widget and saves it",
    async run({ page, base, expect }) {
      // A fresh load: earlier flows changed the settings behind this page's back.
      await page.goto(`${base}/admin/`);
      await page.reload();
      await page.getByTestId("grid-editor").waitFor();
      const widget = page.locator('[data-widget="home-countdown"]');
      // The keyboard resizes a widget the same way dragging its corner does, and is steadier in a test.
      await widget.focus();
      await page.keyboard.press("Shift+ArrowLeft");
      const after = await widget.getAttribute("aria-label");
      expect(after.includes("2 by 3"), `the widget didn't shrink: ${after}`);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Saved. Displays update within 30 seconds.").waitFor();
      const { config } = await (await page.request.get(`${base}/api/admin/config/`)).json();
      const saved = config.views.find((v) => v.id === "home").widgets.find((w) => w.id === "home-countdown");
      expect(saved.w === 2 && saved.h === 3, `saved as ${saved.w} by ${saved.h}`);
    },
  },
  {
    name: "the admin panel works on a phone",
    async run({ browser, page, base, expect }) {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
      const p = await phone.newPage();
      await p.goto(`${base}/admin/`);
      await p.getByTestId("grid-editor").waitFor();
      await p.getByRole("navigation", { name: "Sections" }).last().getByRole("button", { name: "Colours" }).click();
      await p.getByRole("button", { name: "Copy this scheme" }).waitFor();
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(!overflow, "the admin panel scrolls sideways on a phone");
      await phone.close();
    },
  },
  {
    name: "a family note reaches the display",
    async run({ browser, page, base, expect }) {
      const r = await page.request.post(`${base}/api/messages/`, {
        headers: { origin: base },
        data: { author: "Mom", text: "Soccer moved to 5", colour: "pink", expiresInHours: 24 },
      });
      expect(r.status() === 201, `post: ${r.status()}`);
      const { config, version } = await (await page.request.get(`${base}/api/admin/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      home.widgets = home.widgets.filter((w) => w.id !== "home-photos");
      home.widgets.push({ id: "e2e-board", type: "messages", x: 4, y: 3, w: 5, h: 5, count: 5 });
      const saved = await page.request.put(`${base}/api/admin/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(saved.ok(), `save: ${saved.status()}`);
      const url = await addDevice(page, base, "home");
      const d = await openDisplay(browser, url);
      await d.page.locator(".msg-pink").getByText("Soccer moved to 5").waitFor();
      expect(d.errors.length === 0, d.errors.join("\n"));
      await d.context.close();
    },
  },
];
