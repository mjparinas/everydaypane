import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { PackageCarrier, PackagesData, PackageStatus, PackageTrack } from "@/lib/display/types";

import { cached, type Cached } from "./cache";
import { env } from "./env";

const TTL = 10 * 60_000;

const CARRIER_17: Record<PackageCarrier, number> = {
  ups: 1001,
  fedex: 1002,
  canadaPost: 1003,
  usps: 1004,
  other: 0,
};

const carriersFromWidgets = (config: DashboardConfig) => {
  const map = new Map<string, { carrier: PackageCarrier; trackingNumber: string; label?: string }>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "packages") continue;
      for (const p of w.packages) map.set(p.id, { carrier: p.carrier, trackingNumber: p.trackingNumber, label: p.label });
    }
  }
  return [...map.entries()];
};

function statusOf(code?: number): PackageStatus {
  if (code === undefined) return "unknown";
  if (code >= 40) return "delivered";
  if (code >= 30) return "outForDelivery";
  if (code >= 10) return "inTransit";
  if (code >= 0) return "preTransit";
  return "exception";
}

interface TrackAnswer {
  data?: {
    accepted?: {
      number: string;
      tag?: string;
      track_info?: { latest_status?: { status?: string }; latest_event?: { description?: string } };
    }[];
  };
}

async function track17(numbers: { number: string; carrier: number }[]): Promise<Map<string, { status: PackageStatus; summary: string }>> {
  const key = env.packageTrackKey();
  if (!key || numbers.length === 0) return new Map();
  const r = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
    method: "POST",
    headers: { "17token": key, "Content-Type": "application/json" },
    body: JSON.stringify(numbers.map((n) => ({ number: n.number, carrier: n.carrier }))),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Tracker answered ${r.status}`);
  const body = (await r.json()) as TrackAnswer;
  const out = new Map<string, { status: PackageStatus; summary: string }>();
  for (const row of body.data?.accepted ?? []) {
    const info = row.track_info;
    const summary = info?.latest_event?.description ?? info?.latest_status?.status ?? "On its way";
    out.set(row.number, { status: statusOf(undefined), summary: summary.slice(0, 120) });
  }
  return out;
}

/** Live package status for every packages widget (shared feed). */
export async function packagesFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<PackagesData>> {
  const items = carriersFromWidgets(config);
  const key = `packages:${accountId}:${items.map(([, p]) => `${p.carrier}:${p.trackingNumber}`).join(",")}`;
  const configured = Boolean(env.packageTrackKey());
  return cached(
    key,
    TTL,
    async () => {
      const numbers = items
        .map(([, p]) => ({ number: p.trackingNumber, carrier: CARRIER_17[p.carrier] ?? 0 }))
        .filter((n) => n.carrier > 0);
      let tracked = new Map<string, { status: PackageStatus; summary: string }>();
      if (configured && numbers.length) {
        try {
          tracked = await track17(numbers);
        } catch (error) {
          console.error("[packages] tracker failed", error);
        }
      }
      const packages: PackageTrack[] = items.map(([id, p]) => {
        const hit = tracked.get(p.trackingNumber);
        return {
          id,
          carrier: p.carrier,
          trackingNumber: p.trackingNumber,
          ...(p.label ? { label: p.label } : {}),
          status: hit?.status ?? "unknown",
          summary: hit?.summary ?? (configured ? "No update yet" : "Add PACKAGE_TRACK_API_KEY for live status"),
          updatedAt: now,
        };
      });
      return { updatedAt: now, trackingConfigured: configured, packages };
    },
    now,
  );
}
