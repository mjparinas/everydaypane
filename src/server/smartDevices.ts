import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { HaEntity } from "@/lib/display/types";
import { nativeProviderFromEntity, type DirectSmartProvider } from "@/lib/smartHome";

import { ecobeeAct, ecobeeEntities } from "./ecobee";
import { goveeAct, goveeEntities } from "./govee";
import type { HaAction } from "./homeassistant";
import { hueAct, hueEntities } from "./hue";
import { lifxAct, lifxEntities } from "./lifx";
import { nestAct, nestEntities } from "./nest";
import { smartHomeConnected } from "./smartHomeAuth";
import { smartThingsAct, smartThingsEntities } from "./smartthings";

// Native smart-home devices on the same five-second feed as Home Assistant (Phase 4, Household; Govee 2026-11-21;
// Philips Hue and LIFX 2026-11-25).

export function usedNativeDevices(config: DashboardConfig): {
  controls: Set<string>;
  byProvider: Record<DirectSmartProvider, Set<string>>;
} {
  const controls = new Set<string>();
  const byProvider: Record<DirectSmartProvider, Set<string>> = {
    nest: new Set(),
    ecobee: new Set(),
    smartthings: new Set(),
    govee: new Set(),
    hue: new Set(),
    lifx: new Set(),
  };
  for (const v of config.views) {
    for (const w of v.widgets) {
      if (w.type !== "haEntity" || !w.entityId) continue;
      const provider = w.provider ?? "homeAssistant";
      if (provider === "homeAssistant") continue;
      controls.add(w.entityId);
      byProvider[provider].add(w.entityId);
    }
  }
  return { controls, byProvider };
}

let memo: { key: string; at: number; entities: Record<string, HaEntity> } | null = null;

export async function nativeEntityFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Record<string, HaEntity>> {
  const { byProvider } = usedNativeDevices(config);
  const key =
    accountId +
    ":" +
    [...byProvider.nest].sort().join(",") +
    "|" +
    [...byProvider.ecobee].sort().join(",") +
    "|" +
    [...byProvider.smartthings].sort().join(",") +
    "|" +
    [...byProvider.govee].sort().join(",") +
    "|" +
    [...byProvider.hue].sort().join(",") +
    "|" +
    [...byProvider.lifx].sort().join(",");
  if (memo && memo.key === key && now - memo.at < 2500) return memo.entities;

  const entities: Record<string, HaEntity> = {};
  if (byProvider.nest.size && (await smartHomeConnected(accountId, "nest"))) {
    Object.assign(entities, await nestEntities(accountId, byProvider.nest, now));
  }
  if (byProvider.ecobee.size && (await smartHomeConnected(accountId, "ecobee"))) {
    Object.assign(entities, await ecobeeEntities(accountId, byProvider.ecobee, now));
  }
  if (byProvider.smartthings.size && (await smartHomeConnected(accountId, "smartthings"))) {
    Object.assign(entities, await smartThingsEntities(accountId, byProvider.smartthings, now));
  }
  // Govee keeps each light's state itself, on a slower clock that respects its rate limits (src/server/govee.ts).
  if (byProvider.govee.size) Object.assign(entities, await goveeEntities(accountId, byProvider.govee, now));
  // Hue and LIFX each read every light in one call, kept 15 seconds (src/server/hue.ts, src/server/lifx.ts).
  if (byProvider.hue.size && (await smartHomeConnected(accountId, "hue"))) {
    Object.assign(entities, await hueEntities(accountId, byProvider.hue, now));
  }
  if (byProvider.lifx.size) Object.assign(entities, await lifxEntities(accountId, byProvider.lifx, now));
  memo = { key, at: now, entities };
  return entities;
}

export async function nativeAct(
  accountId: string,
  config: DashboardConfig,
  entityId: string,
  action: HaAction,
  value?: number,
  option?: string,
): Promise<"ok" | "forbidden"> {
  if (!usedNativeDevices(config).controls.has(entityId)) return "forbidden";
  const provider = nativeProviderFromEntity(entityId);
  if (!provider) return "forbidden";
  if (provider === "nest") return nestAct(accountId, entityId, action, value);
  if (provider === "ecobee") return ecobeeAct(accountId, entityId, action, value);
  if (provider === "govee") {
    memo = null;
    if (action === "on" || action === "off" || action === "toggle") return goveeAct(accountId, entityId, { action });
    if ((action === "brightness" || action === "color") && value !== undefined) return goveeAct(accountId, entityId, { action, value });
    if (action === "scene" && option) return goveeAct(accountId, entityId, { action, option });
    return "forbidden";
  }
  if (provider === "hue" || provider === "lifx") {
    memo = null;
    const act = provider === "hue" ? hueAct : lifxAct;
    if (action === "on" || action === "off" || action === "toggle") return act(accountId, entityId, { action });
    if ((action === "brightness" || action === "color") && value !== undefined) return act(accountId, entityId, { action, value });
    return "forbidden";
  }
  return smartThingsAct(accountId, entityId, action, value);
}

/** Tests only. */
export function resetNativeForTests(): void {
  memo = null;
}
