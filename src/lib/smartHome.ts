// Native Nest, ecobee, SmartThings and Govee device ids on the wall (Phase 4; Govee, Melvin, 2026-11-21). Entity keys look like Home Assistant's
// `domain.name` so the same tile code and server allowlist can reuse `nest.*`, `ecobee.*` and `smartthings.*`.

export const SMART_HOME_PROVIDERS = ["homeAssistant", "nest", "ecobee", "smartthings", "govee"] as const;
export type SmartHomeProvider = (typeof SMART_HOME_PROVIDERS)[number];

/** Every provider the server talks to directly, without Home Assistant. */
export type DirectSmartProvider = Exclude<SmartHomeProvider, "homeAssistant">;
/** The direct providers that sign in with OAuth (src/server/smartHomeAuth.ts). Govee uses an API key instead. */
export type NativeSmartProvider = Exclude<DirectSmartProvider, "govee">;

const PREFIX: Record<DirectSmartProvider, string> = {
  nest: "nest",
  ecobee: "ecobee",
  smartthings: "smartthings",
  govee: "govee",
};

/** Turns a provider's raw device id into the entity key widgets and the HA feed use (`nest.abc123`). */
export function smartEntityId(provider: DirectSmartProvider, rawId: string): string {
  const slug = rawId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${PREFIX[provider]}.${slug || "device"}`;
}

export function nativeProviderFromEntity(entityId: string): DirectSmartProvider | null {
  const head = entityId.split(".")[0] ?? "";
  if (head === "nest" || head === "ecobee" || head === "smartthings" || head === "govee") return head;
  return null;
}

export const SMART_ENTITY_RE = /^(?:nest|ecobee|smartthings|govee)\.[a-z0-9_]+$|^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
