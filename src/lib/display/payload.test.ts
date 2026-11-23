import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";

import { displayPayload } from "./payload";

const device = (viewId: string | null) => ({ id: "d1", name: "Kitchen", viewId });

describe("display payload", () => {
  it("sends the scheduled views and the themes they use, and no integration settings", () => {
    const p = displayPayload(defaultConfig(), 3, device(null));
    expect(p.views.map((v) => v.id).sort()).toEqual(["home", "morning", "night"]);
    expect(Object.keys(p.themes)).toEqual(["aurora"]);
    expect(p.fixedViewId).toBeNull();
    expect(JSON.stringify(p)).not.toContain("integrations");
  });

  it("sends only a device's own view", () => {
    const p = displayPayload(defaultConfig(), 3, device("calendar"));
    expect(p.views.map((v) => v.id)).toEqual(["calendar"]);
    expect(p.fixedViewId).toBe("calendar");
  });

  it("falls back to the schedule when a device's view was deleted", () => {
    expect(displayPayload(defaultConfig(), 3, device("gone")).fixedViewId).toBeNull();
  });

  it("shows the first view when the schedule is off", () => {
    const c = defaultConfig();
    c.schedule.enabled = false;
    const p = displayPayload(c, 1, device(null));
    expect(p.views.map((v) => v.id)).toEqual(["home"]);
    expect(p.fixedViewId).toBe("home");
  });

  it("previews any view for an admin", () => {
    expect(displayPayload(defaultConfig(), 1, null, "calendar").views.map((v) => v.id)).toEqual(["calendar"]);
  });
});
