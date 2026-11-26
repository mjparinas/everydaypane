// The pictures in the getting-started emails (src/lib/onboarding.ts). Each one is a small scene drawn from real app
// pictures: the starter-template screenshots (public/templates/, a wall panel in a bezel) and the widget samples
// (public/features/widgets/, as cards), all made from real widgets by `npm run templates:previews`. Re-run after that:
//   node scripts/email-images.mjs
// Writes public/email/onboarding/<file>.jpg at 1008 × 630 (shown at 504 × 315, so sharp on high-density screens),
// as progressive mozjpeg, kept small so the emails load fast on a phone. CHROMIUM_PATH=… to use a local Chromium.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const out = path.join(root, "public/email/onboarding");
const W = 1008;
const H = 630;

const tpl = (n) => pathToFileURL(path.join(root, "public/templates", `${n}.png`)).href;
const wid = (n) => pathToFileURL(path.join(root, "public/features/widgets", `${n}.png`)).href;
const sample = (n) => pathToFileURL(path.join(root, "scripts/email-samples", `${n}.png`)).href;

/** A wall panel: the screenshot in a thin dark bezel. */
const wall = (src, { w = 880, label = "", strip = "" } = {}) => `
  <figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:14px">
    <div class="bezel" style="width:${w}px">
      ${strip ? `<div class="strip">⚠ ${strip}<span>Tap to dismiss ✕</span></div>` : ""}
      <img src="${src}" style="width:100%;display:block;border-radius:6px">
    </div>
    ${label ? `<figcaption>${label}</figcaption>` : ""}
  </figure>`;

/** A widget card at a given width. */
const card = (src, w) => `<div class="card" style="width:${w}px"><img src="${src}" style="width:100%;display:block"></div>`;

/** A widget card cut to a height, for samples with empty space under the content. */
const cardTop = (src, w, h) =>
  `<div class="card" style="width:${w}px;height:${h}px"><img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:top;display:block"></div>`;

/** Part of a wall screenshot as a card: x, y, w, h in the 1920 × 1080 picture, drawn `width` wide. */
const crop = (src, [x, y, w, h], width) => {
  const k = width / w;
  return `<div class="card" style="width:${width}px;height:${Math.round(h * k)}px;position:relative"><img src="${src}" style="position:absolute;left:${-x * k}px;top:${-y * k}px;width:${1920 * k}px"></div>`;
};

const row = (inner, gap = 22) => `<div style="display:flex;align-items:center;justify-content:center;gap:${gap}px">${inner}</div>`;
const col = (inner, gap = 22) => `<div style="display:flex;flex-direction:column;gap:${gap}px">${inner}</div>`;

const SCENES = {
  wall: wall(tpl("kitchen-command")),
  calendars: wall(tpl("calendar-wall")),
  photos: `<div style="position:relative;width:880px">${wall(tpl("photo-frame"))}
    <div class="card" style="position:absolute;right:26px;top:24px;width:300px;opacity:.94"><img src="${wid("countdown")}" style="width:100%;display:block"></div></div>`,
  schedule: row(wall(tpl("morning-brief"), { w: 440, label: "Morning" }) + wall(tpl("night-clock"), { w: 440, label: "Overnight" }), 30),
  layouts: `<div style="display:grid;grid-template-columns:repeat(3,290px);gap:18px">${[
    "family-hub",
    "kitchen-glance",
    "kids-routine",
    "night-clock",
    "commute-dash",
    "smart-home",
  ]
    .map((n) => `<div class="thumb"><img src="${tpl(n)}"></div>`)
    .join("")}</div>`,
  meals: row(card(wid("meals"), 400) + card(wid("shopping"), 400)),
  weather: row(card(wid("weather"), 560) + col(card(wid("airQuality"), 300) + card(wid("sunTimes"), 300), 18)),
  chores: card(wid("chores"), 780),
  guests: row(card(wid("countdown"), 400) + col(card(wid("clock"), 360) + card(wid("note"), 360), 18)),
  alerts: wall(tpl("kitchen-glance"), { strip: "Orange warning · rainfall · in effect · Metro Vancouver, southeast including Langley" }),
  "wall-ready": wall(tpl("dual-city")),
  "smart-home": row(
    col(crop(tpl("smart-home"), [0, 270, 960, 270], 440) + card(wid("media"), 440), 18) + crop(tpl("smart-home"), [960, 0, 960, 540], 440),
  ),
  "out-the-door": row(col(cardTop(wid("commute"), 380, 230) + cardTop(wid("ferries"), 380, 200), 18) + card(wid("transit"), 470)),
  "family-board": row(card(wid("messages"), 430) + card(wid("whiteboard"), 430)),
  "screen-saver": row(
    wall(tpl("photo-frame"), { w: 440, label: "When it's quiet" }) +
      `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:14px"><div class="bezel" style="width:440px"><div style="aspect-ratio:16/9;background:#000;border-radius:6px"></div></div><figcaption>At night</figcaption></figure>`,
    30,
  ),
  timers: wall(sample("timer-alert")),
  house: row(card(wid("laundry"), 420) + col(cardTop(wid("airthings"), 400, 150) + card(wid("unifi"), 400), 18)),
  sports: cardTop(wid("sports"), 780, 250),
};

const page = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:Arial,Helvetica,sans-serif;
    background:radial-gradient(120% 90% at 0% 0%,#dfe6ff 0%,rgba(223,230,255,0) 55%),radial-gradient(90% 80% at 100% 100%,#fff1cc 0%,rgba(255,241,204,0) 50%),#f6f7fb}
  .bezel{background:#151a26;padding:9px;border-radius:14px;box-shadow:0 18px 40px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.12);position:relative;overflow:hidden}
  .strip{position:absolute;left:9px;right:9px;top:9px;z-index:2;background:#c92a2a;color:#fff;font-size:12px;font-weight:700;padding:8px 12px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between}
  .strip span{font-weight:400;opacity:.85}
  .card{background:#fff;border:1px solid #e4e7ef;border-radius:18px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,.12)}
  .thumb{background:#151a26;padding:5px;border-radius:9px;box-shadow:0 10px 24px rgba(15,23,42,.16)}
  .thumb img{width:100%;display:block;border-radius:4px}
  figcaption{font-size:15px;font-weight:700;color:#526077;letter-spacing:.04em;text-transform:uppercase}
</style></head><body>${inner}</body></html>`;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const only = process.env.ONLY?.split(",");
for (const [name, inner] of Object.entries(SCENES)) {
  if (only && !only.includes(name)) continue;
  const file = path.join(out, `${name}.html`);
  fs.writeFileSync(file, page(inner));
  await tab.goto(pathToFileURL(file).href);
  await tab.waitForLoadState("networkidle");
  const png = await tab.screenshot({ type: "png" });
  fs.rmSync(file);
  await sharp(png)
    .jpeg({ quality: 76, mozjpeg: true, progressive: true })
    .toFile(path.join(out, `${name}.jpg`));
  console.log(`  public/email/onboarding/${name}.jpg  ${Math.round(fs.statSync(path.join(out, `${name}.jpg`)).size / 1024)} KB`);
}
await browser.close();
