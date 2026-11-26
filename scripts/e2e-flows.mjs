// Display flows for scripts/e2e.mjs: add a device through the admin API, unlock `/display/` like a signed-in wall
// (or phone QR would), and check it draws, ticks, polls for changes and survives going offline.

const VIEWPORT = { width: 1920, height: 1080 }; // kitchen wall panel size

async function addDevice(page, base, viewId = null) {
  // Unique names: the unlock picker lists every device, and e2e adds many "Kitchen" rows.
  const name = `Wall ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await page.request.post(`${base}/api/household/devices/`, { headers: { origin: base }, data: { name, viewId } });
  if (r.status() !== 201) throw new Error(`add device: ${r.status()}`);
  const body = await r.json();
  return {
    base,
    deviceId: body.device.id,
    name: body.device.name,
    url: String(body.url).replace(/^https?:\/\/[^/]+/, base),
  };
}

async function copyAdminSession(context, adminPage, base) {
  const session = (await adminPage.context().cookies()).filter((c) => c.name === "ep_test_session" || c.name === "ep_session");
  await context.addCookies(
    session.map((c) => ({
      name: c.name,
      value: c.value,
      url: base,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
      expires: c.expires > 0 ? c.expires : undefined,
    })),
  );
}

/** Unlock on this page via the signed-in picker; leaves the dashboard loaded. */
async function unlockOnPage(page, device) {
  await page.goto(`${device.base}/display/unlock/`);
  await page.getByRole("button", { name: device.name, exact: true }).click();
  await page.waitForURL((u) => {
    const path = new URL(u).pathname;
    return path === "/display/" || path === "/display";
  });
  // Confirm the lightweight shell actually booted (URL alone can race a redirect).
  await page.locator("body[data-token]").waitFor({ timeout: 15_000 });
}

/** Copy the admin session, unlock, leave cookies for later pages in this context. */
async function unlockDisplayContext(context, adminPage, device) {
  await copyAdminSession(context, adminPage, device.base);
  const page = await context.newPage();
  await unlockOnPage(page, device);
  await page.close();
}

/** Opens the wall after unlocking with the admin session (same tab stays on the dashboard). */
async function openDisplay(browser, adminPage, device) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await copyAdminSession(context, adminPage, device.base);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Weather and air come from Open-Meteo; a sandbox without internet answers 502, which the display handles.
  page.on("response", (r) => {
    if (r.status() >= 400 && !/\/api\/display\/(weather|air)\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
  });
  await unlockOnPage(page, device);
  return { context, page, errors };
}

export const flows = [
  {
    name: "a display draws its view and the clock ticks",
    async run({ browser, page, base, expect }) {
      const device = await addDevice(page, base, "home");
      const d = await openDisplay(browser, page, device);
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
      const device = await addDevice(page, base, "home");
      const d = await openDisplay(browser, page, device);
      await d.page.locator(".cell").first().waitFor();
      const { config, version } = await (await page.request.get(`${base}/api/household/config/`)).json();
      config.views
        .find((v) => v.id === "home")
        .widgets.push({ id: "e2e-note", type: "note", x: 4, y: 2, w: 2, h: 1, text: "Hello from the admin", size: "m" });
      config.views.find((v) => v.id === "home").widgets = config.views
        .find((v) => v.id === "home")
        .widgets.filter((w) => w.id !== "home-aq");
      const saved = await page.request.put(`${base}/api/household/config/`, {
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
      const device = await addDevice(page, base, "night");
      const d = await openDisplay(browser, page, device);
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
      const r = await fetch(`${base}/d/not-a-real-token-1234567890/`, { redirect: "manual" });
      expect(r.status === 308, `status ${r.status}`);
      expect((r.headers.get("location") || "").endsWith("/display/"), `location ${r.headers.get("location")}`);
      const locked = await fetch(`${base}/display/`, { redirect: "manual" });
      expect(locked.status === 307 || locked.status === 302, `locked status ${locked.status}`);
      expect((locked.headers.get("location") || "").includes("/display/unlock"), `locked location ${locked.headers.get("location")}`);
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
      // Doubled with the gzipped budget (Melvin, 2026-11-25: "double the size of the limit"); bundle-check.mjs holds
      // the real 80 KB gzipped line, this only catches a bundle that stopped minifying.
      expect(bytes < 240_000, `display.js is ${bytes} bytes before gzip`);
    },
  },
  {
    name: "the admin panel resizes a widget and saves it",
    async run({ page, base, expect }) {
      // A fresh load: earlier flows changed the settings behind this page's back.
      await page.goto(`${base}/household/`);
      await page.reload();
      await page.getByTestId("grid-editor").waitFor();
      const widget = page.locator('[data-widget="home-countdown"]');
      // The keyboard moves the bottom-right corner, as dragging that corner does.
      await widget.focus();
      await page.keyboard.press("Shift+ArrowLeft");
      // The editor relabels the widget on its next render, so wait for the label rather than read it at once.
      const labelled = (text) =>
        page
          .locator(`[data-widget="home-countdown"][aria-label*="${text}"]`)
          .waitFor({ timeout: 5_000 })
          .catch(() => undefined);
      await labelled("2 by 3");
      const after = await widget.getAttribute("aria-label");
      expect(after.includes("2 by 3"), `the widget didn't shrink: ${after}`);
      // Any corner resizes (Melvin, 2026-11-21). Dragging the top-left one a cell left grows the widget onto the
      // photos, which other widgets may cover, while its bottom-right corner stays put.
      // The overlay follows the preview's stage, which the preview reports once it has drawn (and again when a draft
      // changes it). Pressing before that report lands hit the overlay a few pixels off the handle in CI
      // (2026-11-26: pointermove on the handle, pointerdown on the grid), so wait for the report and a still layout.
      await page.locator('[data-testid="grid-editor"][data-stage="ready"]').waitFor({ timeout: 10_000 });
      const box = () => widget.locator('[data-corner="nw"]').boundingBox();
      let handle = await box();
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(100);
        const again = await box();
        if (again && handle && again.x === handle.x && again.y === handle.y) break;
        handle = again;
      }
      const grid = await page.getByTestId("grid-editor").boundingBox();
      const cell = grid.width / 12;
      // What sits under the handle, so a failure says whether something covered it.
      const under = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return el
            ? `${el.tagName}${el.getAttribute("data-corner") ? `[${el.getAttribute("data-corner")}]` : ""}.${el.className}`.slice(0, 120)
            : "nothing";
        },
        [handle.x + handle.width / 2, handle.y + handle.height / 2],
      );
      // The pointer events the editor gets, so a failure says whether the drag was cancelled or never moved.
      await page.evaluate(() => {
        const log = [];
        window.__pointerLog = log;
        const grid = document.querySelector('[data-testid="grid-editor"]');
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "gotpointercapture"]) {
          grid.addEventListener(
            type,
            (e) =>
              log.push(
                `${type}@${Math.round(e.clientX)},${Math.round(e.clientY)}:${e.target.getAttribute?.("data-corner") ?? e.target.tagName}`,
              ),
            true,
          );
        }
      });
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 - cell, handle.y + handle.height / 2, { steps: 5 });
      const during = await widget.getAttribute("aria-label");
      await page.mouse.up();
      await labelled("3 by 3 at column 9, row 6");
      const grown = await widget.getAttribute("aria-label");
      // Every widget's place in the editor, so a failure shows what the grown widget would have overlapped.
      const layout = grown.includes("3 by 3 at column 9, row 6")
        ? ""
        : `${(await page.locator("[data-widget]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).join(" | ")}; events: ${(
            await page.evaluate(() => window.__pointerLog ?? [])
          ).join(" ")}`;
      expect(
        grown.includes("3 by 3 at column 9, row 6"),
        `the top-left corner didn't resize: ${grown} (during the drag: ${during}; under the handle: ${under}; grid ${Math.round(grid.width)} px; layout: ${layout})`,
      );
      await page.getByRole("button", { name: "Publish to Wall", exact: true }).click();
      await page.getByText(/Published\. Displays update/).waitFor();
      const { config } = await (await page.request.get(`${base}/api/household/config/`)).json();
      const saved = config.views.find((v) => v.id === "home").widgets.find((w) => w.id === "home-countdown");
      expect(saved.x === 8 && saved.w === 3 && saved.h === 3, `saved as ${saved.w} by ${saved.h} at ${saved.x}`);
    },
  },
  {
    name: "settings download as a backup file and restore from it",
    async run({ page, base, expect }) {
      await page.goto(`${base}/household/#settings/backup`);
      await page.reload();
      await page.getByRole("link", { name: "Download Backup" }).waitFor();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Backup" }).click()]);
      expect(/^everydaypane-settings-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
      const file = await download.path();
      // Change the settings behind the page's back, then put the backup's back.
      const before = await (await page.request.get(`${base}/api/household/config/`)).json();
      const renamed = { ...before.config, name: "Renamed after the backup" };
      const put = await page.request.put(`${base}/api/household/config/`, {
        headers: { origin: base },
        data: { baseVersion: before.version, config: renamed },
      });
      expect(put.ok(), `status ${put.status()}`);
      await page.reload();
      await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
      await page.getByTestId("restore-confirm").waitFor();
      await page.getByRole("button", { name: "Restore These Settings" }).click();
      await page.getByText(/^Restored .*Displays pick it up within 30 seconds\.$/).waitFor();
      const after = await (await page.request.get(`${base}/api/household/config/`)).json();
      expect(after.config.name === before.config.name, `name is ${after.config.name}`);
      expect(after.version === before.version + 2, `version ${after.version}`);
    },
  },
  {
    // Melvin, 2026-11-25: a scroll container around the Settings navigation pinned it 6.5rem down inside the panel,
    // leaving a wide empty band under the header and covering the first cards.
    name: "the Settings navigation sits right under the header and sticks there",
    async run({ page, base, expect }) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${base}/household/#settings/dashboard`);
      await page.reload();
      const nav = page.getByRole("navigation", { name: "Settings sections" });
      await nav.waitFor();
      // The reload keeps the earlier flow's scroll position; measure from the top of the page.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0);
      const gap = async () =>
        page.evaluate(() => {
          const header = document.querySelector("header").getBoundingClientRect().bottom;
          const n = document.querySelector('nav[aria-label="Settings sections"]').getBoundingClientRect();
          const card = document.getElementById("settings-dashboard").getBoundingClientRect().top;
          return { above: n.top - header, cardBelow: card - n.bottom };
        });
      const top = await gap();
      expect(top.above >= 0 && top.above <= 32, `navigation ${top.above}px below the header`);
      expect(top.cardBelow >= 0, `navigation covers the first card by ${-top.cardBelow}px`);
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => window.scrollY > 200);
      const scrolled = await gap();
      expect(scrolled.above >= -8 && scrolled.above <= 8, `sticky navigation ${scrolled.above}px from the header`);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  {
    name: "the admin panel works on a phone",
    async run({ browser, page, base, expect }) {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
      const p = await phone.newPage();
      await p.goto(`${base}/household/`);
      await p.getByTestId("grid-editor").waitFor();
      await p.getByRole("navigation", { name: "Sections" }).last().getByRole("button", { name: "Colours" }).click();
      await p.getByRole("button", { name: "Copy This Scheme" }).waitFor();
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
      const { config, version } = await (await page.request.get(`${base}/api/household/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      home.widgets = home.widgets.filter((w) => w.id !== "home-photos");
      home.widgets.push({ id: "e2e-board", type: "messages", x: 4, y: 3, w: 5, h: 5, count: 5 });
      const saved = await page.request.put(`${base}/api/household/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(saved.ok(), `save: ${saved.status()}`);
      const device = await addDevice(page, base, "home");
      const d = await openDisplay(browser, page, device);
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
      // Exact name: a "Repeat Dinner on …" select is also a combobox whose name contains Dinner.
      const dinner = tomorrow.getByRole("combobox", { name: /^Dinner$/ });
      await dinner.fill("Tacos");
      const saved = p.waitForResponse((r) => r.url().includes("/api/meals/") && r.request().method() === "PUT");
      await dinner.press("Enter");
      expect((await saved).ok(), "the meal wasn't saved");
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(!overflow, "the family page scrolls sideways on a phone");
      await phone.close();

      const { config, version } = await (await page.request.get(`${base}/api/household/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      home.widgets = home.widgets.filter((w) => w.id !== "home-photos" && w.id !== "e2e-board");
      home.widgets.push({ id: "e2e-meals", type: "meals", x: 4, y: 3, w: 5, h: 5, days: 7, slots: ["breakfast", "lunch", "dinner"] });
      const put = await page.request.put(`${base}/api/household/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(put.ok(), `save: ${put.status()}`);
      const device = await addDevice(page, base, "home");
      const d = await openDisplay(browser, page, device);
      await d.page.locator(".w-meals").getByText("Tacos").waitFor();
      expect(d.errors.length === 0, d.errors.join("\n"));
      await d.context.close();
    },
  },
  {
    name: "widgets on top of a photos widget are drawn above the photo and stay readable",
    async run({ browser, page, base, expect }) {
      const { config, version } = await (await page.request.get(`${base}/api/household/config/`)).json();
      const home = config.views.find((v) => v.id === "home");
      const countdown = home.widgets.find((w) => w.type === "countdown");
      config.views.push({
        id: "e2e-frame",
        name: "Photo frame",
        cols: 12,
        rows: 8,
        gap: 16,
        padding: 24,
        tilePadding: 16,
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
      const saved = await page.request.put(`${base}/api/household/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(saved.ok(), `save: ${saved.status()}`);
      const device = await addDevice(page, base, "e2e-frame");
      const context = await browser.newContext({ viewport: VIEWPORT });
      await unlockDisplayContext(context, page, device);
      // A drawn landscape stands in for an album, so the test needs no photo service.
      const picture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#f6b26b"/><stop offset=".55" stop-color="#f9e0b0"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#s)"/><circle cx="1350" cy="520" r="120" fill="#fff3d6"/><path d="M0 700 420 380 760 640 1100 300 1500 620 1920 420V1080H0Z" fill="#5a6e8c"/><path d="M0 820 520 600 980 800 1400 640 1920 780V1080H0Z" fill="#2f4058"/><rect y="900" width="1920" height="180" fill="#1d2a3d"/></svg>`;
      await context.route("**/api/display/photos/**", (r) =>
        r.fulfill({ json: { updatedAt: 1, sources: { lib: { photos: [["p1", 1920, 1080, "2026-08-01"]], error: null } } } }),
      );
      await context.route("**/api/display/photo/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: picture }));
      const d = await context.newPage();
      const errors = [];
      d.on("pageerror", (e) => errors.push(e.message));
      await d.goto(device.url);
      await d.locator(".ph-slide.on .ph-img").waitFor();
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
      const device = await addDevice(page, base, "home");
      const context = await browser.newContext({ viewport: VIEWPORT });
      await unlockDisplayContext(context, page, device);
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
      await d.goto(device.url);
      const strip = d.locator(".alert-strip.show");
      await strip.getByText("Orange warning - rainfall - in effect").waitFor();
      // The strip pushes the layout down instead of covering it.
      const stripBottom = (await strip.boundingBox()).y + (await strip.boundingBox()).height;
      const firstCell = await d.locator(".cell").first().boundingBox();
      expect(firstCell.y >= stripBottom - 1, "the strip covers the widgets");
      // A tap only opens the strip (design review, 2026-11-26); Dismiss is its own button.
      await strip.click();
      await strip.getByText("Rainfall amounts of 80 to 100 mm.").waitFor();
      expect((await d.locator(".alert-strip.show").count()) === 1, "a tap on the strip dismissed it");
      await strip.getByRole("button", { name: "Dismiss" }).click();
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
      const device = await addDevice(page, base, "calendar");
      const context = await browser.newContext({ viewport: VIEWPORT });
      await unlockDisplayContext(context, page, device);
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
      await d.goto(device.url);
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
  {
    name: "the screen saver goes dark when nobody uses the screen, and a tap brings the dashboard back",
    async run({ browser, page, base, expect }) {
      const device = await addDevice(page, base, "home");
      const context = await browser.newContext({ viewport: VIEWPORT });
      await unlockDisplayContext(context, page, device);
      // Switched on for this screen only, by changing the settings it receives, so other flows keep theirs.
      await context.route("**/api/display/state/**", async (r) => {
        try {
          const res = await r.fetch();
          if (res.status() !== 200) return await r.fulfill({ response: res });
          const json = await res.json();
          json.screenSaver = { ...json.screenSaver, idle: true, shows: "dark", minutes: 0.1 };
          await r.fulfill({ response: res, json });
        } catch {
          // The page closed while this request was in flight.
        }
      });
      const d = await context.newPage();
      await d.goto(device.url);
      // The dark saver immediately hides the dashboard, so wait for the clock to mount rather than become visible.
      await d.locator(".cell-clock .c-hm").first().waitFor({ state: "attached" });
      // The short idle threshold exercises the loaded settings without a simulated clock; the unit tests cover the
      // exact timing rule. A positive threshold also keeps the saver off after the tap wakes the dashboard.
      await d.locator(".saver.show.saver-dark").waitFor();
      expect(await d.locator(".stage").evaluate((el) => getComputedStyle(el).visibility === "hidden"), "the dashboard still paints");
      await d.locator(".saver.show").click();
      await d.locator(".saver.show").waitFor({ state: "detached" });
      expect(await d.locator(".cell-clock").first().isVisible(), "the dashboard didn't come back");
      await context.close();
    },
  },
  {
    name: "an idle view takes over when nobody uses the screen, and a tap goes back to the dashboard without pressing it",
    async run({ browser, page, base, expect }) {
      const device = await addDevice(page, base, "home");
      const context = await browser.newContext({ viewport: VIEWPORT });
      await unlockDisplayContext(context, page, device);
      let idleId = "";
      await context.route("**/api/display/state/**", async (r) => {
        try {
          const res = await r.fetch();
          if (res.status() !== 200) return await r.fulfill({ response: res });
          const json = await res.json();
          // The server sends only the views this screen needs, so idle on its own view (the settings here are changed
          // in the browser, after the server picked them).
          idleId = json.views.find((v) => v.widgets.length > 0)?.id ?? "";
          json.screenSaver = { ...json.screenSaver, idle: true, shows: "view", viewId: idleId, minutes: 0.1 };
          await r.fulfill({ response: res, json });
        } catch {
          // The page closed while this request was in flight.
        }
      });
      const d = await context.newPage();
      await d.goto(device.url);
      await d.locator(".stage:not(.idle-stage) .cell").first().waitFor({ state: "attached" });
      await d.locator(".saver.show.saver-view .idle-stage .cell").first().waitFor();
      expect(idleId !== "", "the display got no view with widgets to idle on");
      expect(
        await d.locator(".stage:not(.idle-stage)").evaluate((el) => getComputedStyle(el).visibility === "hidden"),
        "the dashboard still paints under the idle view",
      );
      expect(await d.locator(".idle-stage").evaluate((el) => getComputedStyle(el).pointerEvents === "none"), "the idle view takes touches");
      await d.locator(".saver.show").click();
      await d.locator(".idle-stage").waitFor({ state: "detached" });
      expect(await d.locator(".stage:not(.idle-stage) .cell").first().isVisible(), "the dashboard didn't come back");
      await context.close();
    },
  },
  {
    name: "a kid ticks a chore off on the wall and earns its stars",
    async run({ browser, page, base, expect }) {
      // Settings › Chores on a phone: add a kid, then a chore for them.
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
      const p = await phone.newPage();
      await p.goto(`${base}/household/#settings/chores`);
      await p.getByLabel("Add a Kid").waitFor();
      await p.getByLabel("Add a Kid").fill("Ana");
      await p.getByLabel("Add a Kid").press("Enter");
      await p.getByLabel("Add a Chore").fill("Make the bed");
      await p.getByLabel("Add a Chore").press("Enter");
      await p.getByRole("group", { name: "Who" }).getByRole("button", { name: "Ana", pressed: true }).waitFor();
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(!overflow, "Settings › Chores scrolls sideways on a phone");
      await phone.close();

      const { config, version } = await (await page.request.get(`${base}/api/household/config/`)).json();
      config.chores = {
        people: [
          { id: "ana", name: "Ana", emoji: "🦊", color: "#e8590c", goal: 10 },
          { id: "ben", name: "Ben", emoji: "🐻", color: "#1c7ed6", goal: 0 },
        ],
        items: [
          {
            id: "bed",
            name: "Make the bed",
            emoji: "🛏️",
            stars: 2,
            days: [0, 1, 2, 3, 4, 5, 6],
            personIds: ["ana", "ben"],
            rotate: "none",
          },
          { id: "cat", name: "Feed the cat", emoji: "🐈", stars: 1, days: [0, 1, 2, 3, 4, 5, 6], personIds: ["ana", "ben"], rotate: "day" },
        ],
      };
      config.views.push({
        id: "e2e-chores",
        name: "Chores",
        cols: 12,
        rows: 8,
        gap: 16,
        padding: 24,
        tilePadding: 16,
        themeId: null,
        widgets: [{ id: "c-chart", type: "chores", x: 0, y: 0, w: 8, h: 6, personIds: [], showStars: true, allowCheck: true }],
      });
      const put = await page.request.put(`${base}/api/household/config/`, {
        headers: { origin: base },
        data: { baseVersion: version, config },
      });
      expect(put.ok(), `save: ${put.status()}`);
      const d = await openDisplay(browser, page, await addDevice(page, base, "e2e-chores"));
      const ana = d.page.locator(".ch-col").filter({ hasText: "Ana" });
      await ana.getByText("Make the bed").waitFor();
      const saved = d.page.waitForResponse((r) => r.url().includes("/api/display/chores/") && r.request().method() === "POST");
      await ana.getByRole("button", { name: /Make the bed/ }).click();
      expect((await saved).ok(), "the tick wasn't saved");
      await ana.locator(".ch-stars").getByText("⭐ 2 / 10").waitFor();
      if (process.env.E2E_SHOTS) await d.page.screenshot({ path: `${process.env.E2E_SHOTS}/chore-chart.png` });
      // Another screen sees it.
      const other = await openDisplay(browser, page, await addDevice(page, base, "e2e-chores"));
      await other.page.locator(".ch-col").filter({ hasText: "Ana" }).locator(".ch-done").getByText("Make the bed").waitFor();
      expect(d.errors.length === 0 && other.errors.length === 0, [...d.errors, ...other.errors].join("\n"));
      await d.context.close();
      await other.context.close();
    },
  },
];
