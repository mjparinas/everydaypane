// Native Nest, ecobee and SmartThings device ids on the wall (Phase 4). Entity keys look like Home Assistant's
// `domain.name` so the same tile code and server allowlist can reuse `nest.*`, `ecobee.*` and `smartthings.*`.

export const SMART_HOME_PROVIDERS = ["homeAssistant", "nest", "ecobee", "smartthings"] as const;
export type SmartHomeProvider = (typeof SMART_HOME_PROVIDERS)[number];

export type NativeSmartProvider = Exclude<SmartHomeProvider, "homeAssistant">;

const PREFIX: Record<NativeSmartProvider, string> = {
  nest: "nest",
  ecobee: "ecobee",
  smartthings: "smartthings",
};

/** Turns a provider's raw device id into the entity key widgets and the HA feed use (`nest.abc123`). */
export function smartEntityId(provider: NativeSmartProvider, rawId: string): string {
  const slug = rawId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${PREFIX[provider]}.${slug || "device"}`;
}

export function nativeProviderFromEntity(entityId: string): NativeSmartProvider | null {
  const head = entityId.split(".")[0] ?? "";
  if (head === "nest" || head === "ecobee" || head === "smartthings") return head;
  return null;
}

export const SMART_ENTITY_RE = /^(?:nest|ecobee|smartthings)\.[a-z0-9_]+$|^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
