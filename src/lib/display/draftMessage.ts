import type { DisplayPayload } from "@/lib/display/types";

// Admin → preview iframe (Melvin, 2026-11-22: live draft preview on the Views tab). Namespaced so earth's own
// frame and other windows never collide.

export const DRAFT_SOURCE = "everydaypane-admin";
export const PREVIEW_SOURCE = "everydaypane-preview";

export type DraftMessage =
  { source: typeof DRAFT_SOURCE; type: "draft"; payload: DisplayPayload } | { source: typeof DRAFT_SOURCE; type: "clear" };

export type PreviewReadyMessage = { source: typeof PREVIEW_SOURCE; type: "ready" };

export function draftMessage(payload: DisplayPayload): DraftMessage {
  return { source: DRAFT_SOURCE, type: "draft", payload };
}

export function clearDraftMessage(): DraftMessage {
  return { source: DRAFT_SOURCE, type: "clear" };
}

export function previewReadyMessage(): PreviewReadyMessage {
  return { source: PREVIEW_SOURCE, type: "ready" };
}

/** True when this looks like a DisplayPayload the preview can apply (shape check only). */
export function isDisplayPayload(value: unknown): value is DisplayPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.version === "number" && Array.isArray(p.views) && typeof p.themes === "object" && p.themes !== null;
}

/** Parse an admin → preview message. Returns null when it isn't ours or is malformed. */
export function parseDraftMessage(data: unknown): DraftMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.source !== DRAFT_SOURCE) return null;
  if (m.type === "clear") return { source: DRAFT_SOURCE, type: "clear" };
  if (m.type === "draft" && isDisplayPayload(m.payload)) return { source: DRAFT_SOURCE, type: "draft", payload: m.payload };
  return null;
}

/** Parse a preview → admin ready ping. */
export function parsePreviewReady(data: unknown): PreviewReadyMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.source !== PREVIEW_SOURCE || m.type !== "ready") return null;
  return { source: PREVIEW_SOURCE, type: "ready" };
}
