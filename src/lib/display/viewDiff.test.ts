import { describe, expect, it } from "vitest";

import { newWidget } from "@/lib/config/widgets";

import { diffWidgets, sameStageGrid, stageGridStyle, widgetOptionsKey } from "./viewDiff";

describe("viewDiff", () => {
  it("writes the stage grid CSS the display uses", () => {
    expect(stageGridStyle({ cols: 12, rows: 8, gap: 16, padding: 14, tilePadding: 16 })).toBe(
      "grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(8,minmax(0,1fr));gap:16px;padding:14px;--cell-pad:16px",
    );
  });

  it("treats placement as outside the options key", () => {
    const a = newWidget("clock", "c1", { x: 0, y: 0 });
    const b = { ...a, x: 3, y: 1, w: 3, h: 2 };
    expect(widgetOptionsKey(a)).toBe(widgetOptionsKey(b));
    expect(widgetOptionsKey({ ...a, showSeconds: true })).not.toBe(widgetOptionsKey(a));
  });

  it("moves a clock without replacing the weather", () => {
    const clock = newWidget("clock", "clock", { x: 0, y: 0 });
    const weather = newWidget("weather", "weather", { x: 2, y: 0 });
    const nextClock = { ...clock, x: 1, y: 0 };
    const ops = diffWidgets([clock, weather], [nextClock, weather]);
    expect(ops).toEqual([{ op: "move", id: "clock", placed: expect.objectContaining({ widget: nextClock, onPhoto: false }) }]);
  });

  it("replaces only the widget whose options changed", () => {
    const clock = newWidget("clock", "clock", { x: 0, y: 0 });
    const note = newWidget("note", "note", { x: 2, y: 0 });
    const nextNote = { ...note, text: "Hello" };
    const ops = diffWidgets([clock, note], [clock, nextNote]);
    expect(ops).toEqual([{ op: "replace", id: "note", placed: expect.objectContaining({ widget: nextNote }) }]);
  });

  it("adds and removes by id", () => {
    const clock = newWidget("clock", "clock", { x: 0, y: 0 });
    const date = newWidget("date", "date", { x: 2, y: 0 });
    expect(diffWidgets([clock], [clock, date])).toEqual([{ op: "add", placed: expect.objectContaining({ widget: date }) }]);
    expect(diffWidgets([clock, date], [clock])).toEqual([{ op: "remove", id: "date" }]);
  });

  it("marks on-photo when a widget slides onto photos", () => {
    const photos = newWidget("photos", "photos", { x: 0, y: 0 });
    const clock = newWidget("clock", "clock", { x: 6, y: 0 });
    const onPhotos = { ...clock, x: 1, y: 1 };
    const ops = diffWidgets([photos, clock], [photos, onPhotos]);
    expect(ops).toEqual([{ op: "move", id: "clock", placed: expect.objectContaining({ onPhoto: true, widget: onPhotos }) }]);
  });

  it("compares stage grid settings", () => {
    const a = { cols: 12, rows: 8, gap: 16, padding: 14, tilePadding: 16 };
    expect(sameStageGrid(a, a)).toBe(true);
    expect(sameStageGrid(a, { ...a, gap: 8 })).toBe(false);
  });
});
