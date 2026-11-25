import {
  DOWN_SIZES,
  downUrl,
  HISTORY,
  longEnough,
  mbps,
  median,
  nextSpeedAt,
  PINGS_PER_CHECK,
  speedText,
  summarize,
  trimHistory,
  UP_SIZES,
  UP_URL,
  type PingReading,
  type SpeedResult,
} from "@/lib/internet";

import { h, setText } from "../dom";
import { fmt, isoDate } from "../format";
import type { Mount } from "./types";

// Internet (Melvin, 2026-11-21: "can we add an internet ping one", "or internet speed"): a ping to Cloudflare every
// so often, with a small graph of the last 60 and the share that got no answer, and now and then a short download
// (and upload) test. Everything is measured by this screen's own browser, so it is the home connection; the readings
// are kept in localStorage so a reload or a settings save doesn't empty the graph or start a test early.

const storeKey = (widgetId: string) => `everydaypane.internet.${widgetId}`;
const PING_TIMEOUT_MS = 5000;
const STEP_TIMEOUT_MS = 20_000;
const SVG_NS = "http://www.w3.org/2000/svg";

interface Saved {
  history: PingReading[];
  speed: SpeedResult | null;
}

function load(widgetId: string): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(widgetId)) ?? "{}") as Partial<Saved>;
    return {
      history: Array.isArray(s.history) ? s.history.filter((r) => typeof r.at === "number") : [],
      speed: s.speed && typeof s.speed.at === "number" ? s.speed : null,
    };
  } catch {
    return { history: [], speed: null };
  }
}

function save(widgetId: string, s: Saved) {
  try {
    localStorage.setItem(storeKey(widgetId), JSON.stringify(s));
  } catch {
    // Still measures, just forgets on reload.
  }
}

/** fetch with a time limit (AbortSignal.timeout isn't in every wall browser). */
async function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Reads a body to the end without keeping it, so a 50 MB test never sits in the wall's memory. */
async function drain(r: Response): Promise<number> {
  if (!r.body) return (await r.arrayBuffer()).byteLength;
  const reader = r.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return n;
    n += value.byteLength;
  }
}

export async function ping(): Promise<number | null> {
  const samples: number[] = [];
  for (let i = 0; i < PINGS_PER_CHECK; i++) {
    const t0 = performance.now();
    try {
      const r = await timed(downUrl(0), {}, PING_TIMEOUT_MS);
      await drain(r);
      if (r.ok) samples.push(performance.now() - t0);
    } catch {
      // No answer: counts only if every ping of the check fails.
    }
  }
  const m = median(samples);
  return m === null ? null : Math.max(1, Math.round(m));
}

async function downloadSpeed(): Promise<number | null> {
  let best: number | null = null;
  for (let i = 0; i < DOWN_SIZES.length; i++) {
    const r = await timed(downUrl(DOWN_SIZES[i]!), {}, STEP_TIMEOUT_MS);
    if (!r.ok) throw new Error(`download ${r.status}`);
    // Timed from the first byte, so the ping isn't counted as transfer time.
    const t0 = performance.now();
    const bytes = await drain(r);
    const ms = performance.now() - t0;
    best = mbps(bytes, ms) ?? best;
    if (longEnough(ms, i, DOWN_SIZES)) break;
  }
  return best;
}

async function uploadSpeed(pingMs: number): Promise<number | null> {
  let best: number | null = null;
  for (let i = 0; i < UP_SIZES.length; i++) {
    const size = UP_SIZES[i]!;
    const t0 = performance.now();
    // No content type, so the browser sends it straight away with no CORS preflight.
    const r = await timed(UP_URL, { method: "POST", body: new Uint8Array(size) }, STEP_TIMEOUT_MS);
    await drain(r);
    if (!r.ok) throw new Error(`upload ${r.status}`);
    const ms = Math.max(1, performance.now() - t0 - pingMs);
    best = mbps(size, ms) ?? best;
    if (longEnough(ms, i, UP_SIZES)) break;
  }
  return best;
}

/** The ping graph: one line through the checks, broken where a check failed (a red tick there). */
function graph(history: readonly PingReading[], slowMs: number): SVGSVGElement {
  const W = 120;
  const H = 30;
  // Scaled to the pings themselves so a steady 13 ms line still shows its wiggle; the "slow" line appears once the
  // pings come near it.
  const top = Math.max(20, ...history.map((r) => (r.ms ?? 0) * 1.6));
  const x = (i: number) => ((i + HISTORY - history.length) / (HISTORY - 1)) * W;
  const y = (ms: number) => H - 1 - (Math.min(ms, top) / top) * (H - 2);
  let line = "";
  let misses = "";
  let pen = false;
  history.forEach((r, i) => {
    if (r.ms === null) {
      pen = false;
      misses += `M${x(i).toFixed(1)} ${H}V${H - 6}`;
      return;
    }
    line += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(r.ms).toFixed(1)}`;
    pen = true;
  });
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", `0 0 ${W} ${H}`);
  el.setAttribute("preserveAspectRatio", "none");
  el.setAttribute("class", "in-graph");
  el.setAttribute("aria-hidden", "true");
  const path = (d: string, cls: string) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", cls);
    p.setAttribute("vector-effect", "non-scaling-stroke");
    el.append(p);
  };
  if (slowMs < top) path(`M0 ${y(slowMs).toFixed(1)}H${W}`, "in-slow");
  if (line) path(line, "in-line");
  if (misses) path(misses, "in-miss");
  return el;
}

const STATUS_TEXT = { checking: "Checking…", online: "Online", slow: "Slow", offline: "Offline" } as const;

export const internet: Mount<"internet"> = (el, w, ctx) => {
  const startedAt = Date.now();
  const saved = load(w.id);
  let history = trimHistory(saved.history, startedAt, w.pingSeconds);
  let speed = saved.speed;
  let testing = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const status = h("span", { class: "in-status" });
  const pingText = h("span", { class: "in-ms" });
  const loss = h("span", { class: "in-loss" });
  const graphBox = h("div", { class: "in-graph-box" });
  const speedLine = h("div", { class: "in-speed" });
  const root = h(
    "button",
    { type: "button", class: "w-internet", "aria-label": "Internet: tap to test the speed" },
    h("div", { class: "in-head" }, h("span", { class: "w-label" }, w.title || "Internet"), status),
    h("div", { class: "in-now" }, pingText, loss),
    w.showGraph ? graphBox : null,
    speedLine,
  );
  el.append(root);

  const when = (at: number) => {
    const now = new Date();
    const time = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 }).format(at);
    if (isoDate(now, ctx.timeZone) === isoDate(new Date(at), ctx.timeZone)) return time;
    return `${fmt(ctx.timeZone, { weekday: "short" }).format(at)} ${time}`;
  };

  const draw = () => {
    const s = summarize(history, w.slowMs);
    root.dataset.status = s.status;
    setText(status, STATUS_TEXT[s.status]);
    setText(pingText, s.ms === null ? "–" : `${s.ms} ms`);
    setText(loss, s.loss > 0 && history.length >= 5 ? `${s.loss}% lost` : "");
    if (w.showGraph) graphBox.replaceChildren(graph(history, w.slowMs));
    let text: string;
    if (testing) text = "Testing speed…";
    else if (!speed) text = w.speedHours > 0 ? "Speed test soon" : "Tap to test the speed";
    else if (speed.down === null) text = `Speed test failed · ${when(speed.at)}`;
    else
      text = [`↓ ${speedText(speed.down)}`, w.upload && speed.up !== null ? `↑ ${speedText(speed.up)}` : "", when(speed.at)]
        .filter(Boolean)
        .join(" · ");
    setText(speedLine, text);
  };

  const persist = () => save(w.id, { history, speed });

  async function runSpeed() {
    if (testing) return;
    testing = true;
    draw();
    const at = Date.now();
    let down: number | null = null;
    let up: number | null = null;
    try {
      down = await downloadSpeed();
      if (w.upload) up = await uploadSpeed(summarize(history, w.slowMs).ms ?? 0).catch(() => null);
    } catch {
      down = null;
    }
    testing = false;
    if (stopped) return;
    speed = { at, down, up };
    persist();
    draw();
  }

  async function check() {
    if (stopped) return;
    // A speed test fills the line, so its pings would be wrong; the next check comes after it.
    if (!testing && !document.hidden) {
      const ms = await ping();
      if (stopped) return;
      history = [...history, { at: Date.now(), ms }].slice(-HISTORY);
      persist();
      draw();
      const due = nextSpeedAt(speed, w.speedHours, startedAt);
      if (due !== null && Date.now() >= due && ms !== null) await runSpeed();
    }
    if (!stopped) timer = setTimeout(() => void check(), w.pingSeconds * 1000);
  }

  root.addEventListener("click", () => void runSpeed());
  draw();
  void check();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};
