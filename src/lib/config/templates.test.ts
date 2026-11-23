import { describe, expect, it } from "vitest";

import { isFreeWidgetType } from "@/lib/plans";

import { VIEW_TEMPLATES } from "./templates";

describe("view templates", () => {
  it("only uses Free-tier widgets so any household can apply them", () => {
    for (const t of VIEW_TEMPLATES) {
      const view = t.build();
      expect(view.widgets.length).toBeGreaterThan(0);
      for (const w of view.widgets) {
        expect(isFreeWidgetType(w.type), `${t.id} includes paid widget ${w.type}`).toBe(true);
      }
    }
  });

  it("keeps widgets on a 12×8 grid", () => {
    for (const t of VIEW_TEMPLATES) {
      const view = t.build();
      expect(view.cols).toBe(12);
      expect(view.rows).toBe(8);
      for (const w of view.widgets) {
        expect(w.x + w.w).toBeLessThanOrEqual(view.cols);
        expect(w.y + w.h).toBeLessThanOrEqual(view.rows);
      }
    }
  });
});
