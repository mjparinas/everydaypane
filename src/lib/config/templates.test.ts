import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isFreeWidgetType } from "@/lib/plans";

import { collides } from "./grid";
import { templateIsFree, VIEW_TEMPLATES } from "./templates";

describe("view templates", () => {
  it("ships about twenty starter layouts", () => {
    expect(VIEW_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });

  it("marks Free templates with only Free-tier widgets", () => {
    for (const t of VIEW_TEMPLATES) {
      const view = t.build();
      expect(view.widgets.length).toBeGreaterThan(0);
      const allFree = view.widgets.every((w) => isFreeWidgetType(w.type));
      if (t.tier === "free") {
        expect(allFree, `${t.id} is Free but includes a paid widget`).toBe(true);
        expect(templateIsFree(t)).toBe(true);
      } else {
        expect(allFree, `${t.id} is Household but only uses Free widgets`).toBe(false);
      }
    }
  });

  it("keeps widgets on a 12×8 grid without overlapping (photos may sit underneath)", () => {
    for (const t of VIEW_TEMPLATES) {
      const view = t.build();
      expect(view.cols).toBe(12);
      expect(view.rows).toBe(8);
      for (const w of view.widgets) {
        expect(w.x + w.w, `${t.id} ${w.id} runs off columns`).toBeLessThanOrEqual(view.cols);
        expect(w.y + w.h, `${t.id} ${w.id} runs off rows`).toBeLessThanOrEqual(view.rows);
      }
      for (let i = 0; i < view.widgets.length; i++) {
        for (let j = i + 1; j < view.widgets.length; j++) {
          const a = view.widgets[i]!;
          const b = view.widgets[j]!;
          expect(collides(a, b), `${t.id}: ${a.type}/${a.id} overlaps ${b.type}/${b.id}`).toBe(false);
        }
      }
    }
  });

  it("has a committed PNG preview for each template", () => {
    for (const t of VIEW_TEMPLATES) {
      expect(t.preview).toBe(`/templates/${t.id}.png`);
      const file = join(process.cwd(), "public", "templates", `${t.id}.png`);
      expect(existsSync(file), `missing ${t.preview} — run npm run templates:previews`).toBe(true);
    }
  });

  it("keeps the shared sample feeds and photos the screenshot script needs", () => {
    const feeds = join(process.cwd(), "scripts", "template-samples");
    for (const name of [
      "calendar.json",
      "weather.json",
      "photos.json",
      "messages.json",
      "meals.json",
      "chores.json",
      "packages.json",
      "stocks.json",
      "whiteboard.json",
      "menus.json",
    ]) {
      expect(existsSync(join(feeds, name)), `missing sample feed ${name}`).toBe(true);
    }
    const photos = join(process.cwd(), "public", "templates", "samples");
    for (const name of [
      "family-kitchen.jpg",
      "kids-soccer.jpg",
      "ferry-view.jpg",
      "christmas-tree.jpg",
      "halloween-porch.jpg",
      "game-night.jpg",
    ]) {
      expect(existsSync(join(photos, name)), `missing sample photo ${name}`).toBe(true);
    }
  });
});
