import { describe, expect, it } from "vitest";

import { widgetVisible } from "./visibility";
import { newWidget } from "./widgets";

describe("widgetVisible", () => {
  it("shows widgets with no schedule", () => {
    const w = newWidget("clock", "c", { x: 0, y: 0 });
    expect(widgetVisible(w, "morning")).toBe(true);
    expect(widgetVisible(w, null)).toBe(true);
  });

  it("hides outside chosen periods", () => {
    const w = { ...newWidget("note", "n", { x: 0, y: 0 }), visiblePeriods: ["evening", "night"] as ("evening" | "night")[] };
    expect(widgetVisible(w, "morning")).toBe(false);
    expect(widgetVisible(w, "evening")).toBe(true);
  });
});
