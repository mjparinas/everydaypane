import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { displayPayload } from "@/lib/display/payload";

import { clearDraftMessage, draftMessage, parseDraftMessage, parsePreviewReady, previewReadyMessage } from "./draftMessage";

const payload = displayPayload(defaultConfig(), 1, null, "home");

describe("draft messages", () => {
  it("round-trips a draft payload", () => {
    expect(parseDraftMessage(draftMessage(payload))).toEqual({
      source: "everydaypane-admin",
      type: "draft",
      payload,
    });
  });

  it("round-trips a clear", () => {
    expect(parseDraftMessage(clearDraftMessage())).toEqual({ source: "everydaypane-admin", type: "clear" });
  });

  it("ignores other windows and bad shapes", () => {
    expect(parseDraftMessage(null)).toBeNull();
    expect(parseDraftMessage({ source: "other", type: "draft", payload })).toBeNull();
    expect(parseDraftMessage({ source: "everydaypane-admin", type: "draft", payload: { version: 1 } })).toBeNull();
    expect(parseDraftMessage({ source: "everydaypane-admin", type: "nope" })).toBeNull();
  });

  it("round-trips a preview ready ping", () => {
    expect(parsePreviewReady(previewReadyMessage())).toEqual({ source: "everydaypane-preview", type: "ready" });
    expect(parsePreviewReady({ source: "everydaypane-admin", type: "ready" })).toBeNull();
  });
});
