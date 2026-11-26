import "server-only";

import { createHash } from "node:crypto";

import { query, run } from "./db";
import { env } from "./env";

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function visitorHash(ip: string, ua: string, day: string): string {
  const secret = env.analyticsSecret() || "dev";
  return createHash("sha256").update(`${secret}|${day}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

export async function recordPageView(opts: {
  path: string;
  referrer?: string;
  utmSource?: string;
  utmCampaign?: string;
  country?: string;
  browser?: string;
  os?: string;
  device?: string;
  track?: string;
  ip: string;
  ua: string;
  now?: number;
}) {
  const now = opts.now ?? Date.now();
  const day = dayKey(now);
  const visitor = visitorHash(opts.ip, opts.ua, day);
  await run(
    `INSERT INTO page_views (day, visitor, path, referrer, utm_source, utm_campaign, country, browser, os, device, track, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      day,
      visitor,
      opts.path.slice(0, 200),
      opts.referrer?.slice(0, 200) ?? null,
      opts.utmSource?.slice(0, 80) ?? null,
      opts.utmCampaign?.slice(0, 80) ?? null,
      opts.country?.slice(0, 40) ?? null,
      opts.browser?.slice(0, 40) ?? null,
      opts.os?.slice(0, 40) ?? null,
      opts.device?.slice(0, 40) ?? null,
      opts.track?.slice(0, 80) ?? null,
      now,
    ],
  );
}

export async function recordEvent(name: string, props?: unknown, accountId?: string, deviceId?: string, now = Date.now()) {
  await run("INSERT INTO admin_events (name, props, at, account_id, device_id) VALUES (?, ?, ?, ?, ?)", [
    name.slice(0, 80),
    props === undefined ? null : JSON.stringify(props).slice(0, 1000),
    now,
    accountId ?? null,
    deviceId ?? null,
  ]);
}

function periodBounds(days: number, now = Date.now()) {
  const end = now;
  const start = now - days * 86_400_000;
  const prevEnd = start;
  const prevStart = start - days * 86_400_000;
  return { start, end, prevStart, prevEnd };
}

async function countVisitors(start: number, end: number) {
  const rows = await query<{ n: number }>("SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE at >= ? AND at < ?", [start, end]);
  return Number(rows[0]?.n ?? 0);
}

async function countViews(start: number, end: number) {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM page_views WHERE at >= ? AND at < ?", [start, end]);
  return Number(rows[0]?.n ?? 0);
}

async function topColumn(col: string, start: number, end: number, limit = 10) {
  const allowed = new Set(["path", "referrer", "utm_source", "utm_campaign", "country", "browser", "os", "device", "track"]);
  if (!allowed.has(col)) return [];
  const rows = await query<{ label: string | null; n: number }>(
    `SELECT ${col} AS label, COUNT(*) AS n FROM page_views WHERE at >= ? AND at < ? AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY n DESC LIMIT ?`,
    [start, end, limit],
  );
  return rows.map((r) => ({ label: String(r.label), value: Number(r.n) }));
}

async function dailyVisitors(start: number, end: number) {
  const rows = await query<{ day: string; n: number }>(
    "SELECT day, COUNT(DISTINCT visitor) AS n FROM page_views WHERE at >= ? AND at < ? GROUP BY day ORDER BY day ASC",
    [start, end],
  );
  return rows.map((r) => ({ day: r.day, n: Number(r.n) }));
}

export async function trafficStats(days: number) {
  const { start, end, prevStart, prevEnd } = periodBounds(days);
  const visitors = await countVisitors(start, end);
  const prevVisitors = await countVisitors(prevStart, prevEnd);
  const views = await countViews(start, end);
  const prevViews = await countViews(prevStart, prevEnd);
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);
  return {
    visitors,
    views,
    visitorsDelta: pct(visitors, prevVisitors),
    viewsDelta: pct(views, prevViews),
    daily: await dailyVisitors(start, end),
    pages: await topColumn("path", start, end),
    referrers: await topColumn("referrer", start, end),
    sources: await topColumn("utm_source", start, end),
    campaigns: await topColumn("utm_campaign", start, end),
    countries: await topColumn("country", start, end),
    browsers: await topColumn("browser", start, end),
    os: await topColumn("os", start, end),
    devices: await topColumn("device", start, end),
    tracks: await topColumn("track", start, end),
  };
}

export async function acquisitionStats(days: number) {
  const { start, end } = periodBounds(days);
  const signups = await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ? AND created_at < ?", [start, end]);
  const displays = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM devices WHERE created_at >= ? AND created_at < ? AND COALESCE(is_test,0) = 0",
    [start, end],
  );
  return {
    signups: Number(signups[0]?.n ?? 0),
    displays: Number(displays[0]?.n ?? 0),
    sources: await topColumn("utm_source", start, end),
    campaigns: await topColumn("utm_campaign", start, end),
    countries: await topColumn("country", start, end),
    daily: await dailyVisitors(start, end),
  };
}

export async function funnelStats(days: number) {
  const { start, end } = periodBounds(days);
  const visited = await countVisitors(start, end);
  const signups = Number(
    (await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ? AND created_at < ?", [start, end]))[0]?.n ?? 0,
  );
  const withDisplay = Number(
    (
      await query<{ n: number }>(
        `SELECT COUNT(DISTINCT account_id) AS n FROM devices
         WHERE created_at >= ? AND created_at < ? AND account_id IS NOT NULL AND COALESCE(is_test,0) = 0`,
        [start, end],
      )
    )[0]?.n ?? 0,
  );
  const paid = Number(
    (
      await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE plan = 'paid' AND created_at >= ? AND created_at < ?", [
        start,
        end,
      ])
    )[0]?.n ?? 0,
  );
  // Also count upgrades in period via events if present
  const upgraded = Number(
    (
      await query<{ n: number }>("SELECT COUNT(*) AS n FROM admin_events WHERE name = 'household_upgraded' AND at >= ? AND at < ?", [
        start,
        end,
      ])
    )[0]?.n ?? 0,
  );
  const steps = [
    { label: "Visited Site", n: visited },
    { label: "Signed Up (Free)", n: signups },
    { label: "Added a Display", n: withDisplay },
    { label: "Household (Paid)", n: Math.max(paid, upgraded) },
  ];
  let biggest: { from: string; to: string; drop: number } | null = null;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    if (prev.n >= 5 && prev.n > cur.n) {
      const drop = prev.n - cur.n;
      if (!biggest || drop > biggest.drop) biggest = { from: prev.label, to: cur.label, drop };
    }
  }
  return { steps, biggest };
}

export async function deviceBreakdown(days: number) {
  const { start, end } = periodBounds(days);
  return {
    devices: await topColumn("device", start, end),
    browsers: await topColumn("browser", start, end),
    os: await topColumn("os", start, end),
    displaysCreated: Number(
      (
        await query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM devices WHERE created_at >= ? AND created_at < ? AND COALESCE(is_test,0) = 0",
          [start, end],
        )
      )[0]?.n ?? 0,
    ),
  };
}
