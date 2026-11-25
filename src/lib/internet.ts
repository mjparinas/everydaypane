// The internet widget's arithmetic (Melvin, 2026-11-21: "can we add an internet ping one", "or internet speed").
// The measuring happens in the display's own browser (src/display/widgets/internet.ts), because only the screen at
// home can see the home connection: our server on Vercel would measure Vercel's. It talks to Cloudflare's speed test
// servers (speed.cloudflare.com, the same ones its own speed test page uses), which answer any origin, have a
// server in Vancouver, and need no key. Kept free of the DOM so it can be tested on its own.

export const SPEED_HOST = "https://speed.cloudflare.com";
export const downUrl = (bytes: number) => `${SPEED_HOST}/__down?bytes=${bytes}`;
export const UP_URL = `${SPEED_HOST}/__up`;

/** Pings kept for the graph and the loss count. */
export const HISTORY = 60;
/** Each check sends this many pings one after another and keeps the middle one, so one slow handshake doesn't count. */
export const PINGS_PER_CHECK = 3;

// A speed test steps up through these sizes until one takes at least TARGET_MS, so a slow line moves about 11 MB and
// a gigabit line about 61 MB, and the last (largest) one is the reading.
export const DOWN_SIZES = [1_000_000, 10_000_000, 50_000_000];
export const UP_SIZES = [500_000, 2_000_000, 10_000_000];
export const TARGET_MS = 1000;

/** One check: when, and the ping in milliseconds (null when no ping came back). */
export interface PingReading {
  at: number;
  ms: number | null;
}

export interface SpeedResult {
  at: number;
  /** Megabits a second; null when that half of the test failed (or upload isn't measured). */
  down: number | null;
  up: number | null;
}

export type NetStatus = "checking" | "online" | "slow" | "offline";

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * What the widget says now. Two failed checks in a row (or the only check so far) is "offline", so one dropped ping
 * doesn't paint the wall red; a ping above `slowMs` is "slow". Loss is the share of checks in the history that failed.
 */
export function summarize(history: readonly PingReading[], slowMs: number): { status: NetStatus; ms: number | null; loss: number } {
  const last = history.at(-1);
  if (!last) return { status: "checking", ms: null, loss: 0 };
  const failed = history.filter((r) => r.ms === null).length;
  const loss = Math.round((failed / history.length) * 100);
  const prev = history.at(-2);
  if (last.ms === null) {
    const down = !prev || prev.ms === null;
    // After one miss the last good ping is still the best answer.
    return { status: down ? "offline" : prev.ms! > slowMs ? "slow" : "online", ms: down ? null : prev.ms, loss };
  }
  return { status: last.ms > slowMs ? "slow" : "online", ms: last.ms, loss };
}

/** Keeps the latest HISTORY readings, dropping any older than the graph covers (after a reload hours later). */
export function trimHistory(history: readonly PingReading[], now: number, pingSeconds: number): PingReading[] {
  const oldest = now - HISTORY * pingSeconds * 1000 * 1.5;
  return history.filter((r) => r.at >= oldest && r.at <= now).slice(-HISTORY);
}

export const mbps = (bytes: number, ms: number) => (ms > 0 ? (bytes * 8) / (ms * 1000) : null);

/** "8.4 Mbps", "312 Mbps", "1.2 Gbps". */
export function speedText(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return "–";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} Gbps`;
  return m < 10 ? `${m.toFixed(1)} Mbps` : `${Math.round(m)} Mbps`;
}

/** Whether a step that took `ms` was long enough to trust, or the test should move on to the next size. */
export const longEnough = (ms: number, step: number, sizes: readonly number[]) => ms >= TARGET_MS || step >= sizes.length - 1;

/**
 * When the next speed test is due: `hours` after the last one, never sooner than a minute after the widget started
 * (so a reload or a settings save doesn't test while the page is still loading), and half an hour after a failure.
 * Null when speed tests are off.
 */
export function nextSpeedAt(last: SpeedResult | null, hours: number, startedAt: number): number | null {
  if (hours <= 0) return null;
  const soonest = startedAt + 60_000;
  if (!last) return soonest;
  const failed = last.down === null;
  return Math.max(soonest, last.at + (failed ? Math.min(hours * 3_600_000, 30 * 60_000) : hours * 3_600_000));
}
