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
  {
    name: "a meal planned on a phone reaches the display",
    async run({ browser, page, base, expect }) {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
      const p = await phone.newPage();
      await p.goto(`${base}/family/`);
      // Tomorrow, not today: from 8 PM the widget starts at tomorrow, so a meal planned for today drops off in the evening.
      const tomorrow = p.getByRole("region", { name: /^Tomorrow/ });
      const dinner = tomorrow.getByRole("combobox", { name: /Dinner/ });
      await dinner.fill("Tacos");
      const saved = p.waitForResponse((r) => r.url().includes("/api/meals/") && r.request().method() === "PUT");
      await dinner.press("Enter");
      expect((await saved).ok(), "the meal wasn't saved");
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(!overflow, "the family page scrolls sideways on a phone");
      await phone.close();

      const { config, version } = await (await page.request.get(`${base}/api/admin/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      home.widgets = home.widgets.filter((w) => w.id !== "home-photos" && w.id !== "e2e-board");
      home.widgets.push({ id: "e2e-meals", type: "meals", x: 4, y: 3, w: 5, h: 5, days: 7, slots: ["breakfast", "lunch", "dinner"] });
      const put = await page.request.put(`${base}/api/admin/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(put.ok(), `save: ${put.status()}`);
      const url = await addDevice(page, base, "home");
      const d = await openDisplay(browser, url);
      await d.page.locator(".w-meals").getByText("Tacos").waitFor();
      expect(d.errors.length === 0, d.errors.join("\n"));
      await d.context.close();
    },
  },
  {
    name: "widgets on top of a photos widget are drawn above the photo and stay readable",
    async run({ browser, page, base, expect }) {
      const { config, version } = await (await page.request.get(`${base}/api/admin/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      const countdown = home.widgets.find((w) => w.type === "countdown");
      config.views.push({
        id: "e2e-frame",
        name: "Photo frame",
        cols: 12,
        rows: 8,
        gap: 16,
        padding: 24,
        themeId: null,
        widgets: [
          {
            id: "f-photos",
            type: "photos",
            x: 0,
            y: 0,
            w: 12,
            h: 8,
            sourceIds: [],
            intervalSeconds: 600,
            fit: "cover",
            showCaption: false,
          },
          {
            id: "f-clock",
            type: "clock",
            x: 0,
            y: 5,
            w: 4,
            h: 2,
            timeZone: "America/Vancouver",
            label: "",
            showSeconds: false,
            style: "digital",
          },
          { id: "f-date", type: "date", x: 0, y: 7, w: 4, h: 1, timeZone: "America/Vancouver", showYear: false },
          { ...countdown, id: "f-countdown", x: 9, y: 0, w: 3, h: 3 },
        ],
      });
      const saved = await page.request.put(`${base}/api/admin/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(saved.ok(), `save: ${saved.status()}`);
      const url = await addDevice(page, base, "e2e-frame");
      const context = await browser.newContext({ viewport: VIEWPORT });
      // A drawn landscape stands in for an album, so the test needs no photo service.
      const picture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#f6b26b"/><stop offset=".55" stop-color="#f9e0b0"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#s)"/><circle cx="1350" cy="520" r="120" fill="#fff3d6"/><path d="M0 700 420 380 760 640 1100 300 1500 620 1920 420V1080H0Z" fill="#5a6e8c"/><path d="M0 820 520 600 980 800 1400 640 1920 780V1080H0Z" fill="#2f4058"/><rect y="900" width="1920" height="180" fill="#1d2a3d"/></svg>`;
      await context.route("**/api/display/photos/**", (r) =>
        r.fulfill({ json: { updatedAt: 1, sources: { lib: { photos: [["p1", 1920, 1080, "2026-08-01"]], error: null } } } }),
      );
      await context.route("**/api/display/photo/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: picture }));
      const d = await context.newPage();
      const errors = [];
      d.on("pageerror", (e) => errors.push(e.message));
      await d.goto(url);
      await d.locator(".ph-img.on").waitFor();
      await d.locator(".cell-clock .c-hm").waitFor();
      expect(await d.locator(".cell-clock").evaluate((el) => el.classList.contains("on-photo")), "the clock isn't marked as on the photo");
      expect(!(await d.locator(".cell-photos").evaluate((el) => el.classList.contains("on-photo"))), "the photo is marked as on itself");
      // The clock is the element on top where both are drawn, so a tap reaches it rather than the photo.
      const box = await d.locator(".cell-clock").boundingBox();
      const top = await d.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest(".cell")?.className,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(top?.includes("cell-clock"), `the clock is under the photo (${top})`);
      const colour = await d.locator(".cell-clock .c-hm").evaluate((el) => getComputedStyle(el).color);
      expect(colour === "rgb(255, 255, 255)", `the clock over a photo should be white, was ${colour}`);
      if (process.env.E2E_SHOTS) {
        await d.waitForTimeout(1800); // the photo's fade-in
        await d.screenshot({ path: `${process.env.E2E_SHOTS}/widgets-over-photos.png` });
      }
      expect(errors.length === 0, errors.join("\n"));
      await context.close();
    },
  },
  {
    name: "an emergency alert shows as a red strip that a tap dismisses",
    async run({ browser, page, base, expect }) {
      const url = await addDevice(page, base, "home");
      const context = await browser.newContext({ viewport: VIEWPORT });
      const alert = {
        id: "naad:e2e",
        source: "weather",
        severity: "severe",
        title: "Orange warning - rainfall - in effect",
        area: "Metro Vancouver",
        description: "Rainfall amounts of 80 to 100 mm.",
        sent: 1,
        expires: null,
      };
      await context.route("**/api/display/alerts/**", (r) => r.fulfill({ json: { updatedAt: 1, alerts: [alert] } }));
      const d = await context.newPage();
      await d.goto(url);
      const strip = d.locator(".alert-strip.show");
      await strip.getByText("Orange warning - rainfall - in effect").waitFor();
      // The strip pushes the layout down instead of covering it.
      const stripBottom = (await strip.boundingBox()).y + (await strip.boundingBox()).height;
      const firstCell = await d.locator(".cell").first().boundingBox();
      expect(firstCell.y >= stripBottom - 1, "the strip covers the widgets");
      await strip.click();
      await d.locator(".alert-strip.show").waitFor({ state: "detached" });
      // Dismissed stays dismissed on this screen after a reload.
      await d.reload();
      await d.locator(".cell-clock .c-hm").first().waitFor();
      await d.waitForTimeout(1500);
      expect((await d.locator(".alert-strip.show").count()) === 0, "dismissed alert came back");
      await context.close();
    },
  },
  {
    name: "a busy day in the month view keeps full-height rows and says how many more",
    async run({ browser, page, base, expect }) {
      const url = await addDevice(page, base, "calendar");
      const context = await browser.newContext({ viewport: VIEWPORT });
      // Twelve timed events on one day: far more than a day's box holds on a 1080p screen.
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
      const events = Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`,
        title: `Event number ${i + 1}`,
        start: `${day}T${String(8 + i).padStart(2, "0")}:00:00-08:00`,
        end: `${day}T${String(8 + i).padStart(2, "0")}:30:00-08:00`,
        allDay: false,
        color: "#3b82f6",
        calendar: "family",
      }));
      await context.route("**/api/display/calendar/**", (r) =>
        r.fulfill({ json: { updatedAt: 1, from: "2000-01-01", to: "2100-01-01", events, connected: true } }),
      );
      const d = await context.newPage();
      await d.goto(url);
      const today = d.locator(".mo-today");
      await today.locator(".mo-more").waitFor();
      const rows = await today.locator(".mo-ev").evaluateAll((els) => els.map((e) => [e.clientHeight, e.scrollHeight]));
      expect(rows.length > 0 && rows.length < 12, `expected some rows hidden, got ${rows.length}`);
      for (const [shown, needed] of rows) expect(shown >= needed, `a row is squished (${shown}px of ${needed}px)`);
      const more = await today.locator(".mo-more").textContent();
      expect(more === `+${12 - rows.length} more`, `wrong count: ${more}`);
      await context.close();
    },
  },
];
