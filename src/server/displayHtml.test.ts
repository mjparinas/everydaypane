import { describe, expect, it } from "vitest";

import { displayHtml } from "./displayHtml";

describe("display page", () => {
  it("can't be pinch-zoomed (Melvin, 2026-11-17)", async () => {
    const html = await displayHtml({ token: "abc", title: "Kitchen" }).text();
    expect(html).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1,user-scalable=no/);
  });

  it("carries preview view and forced day or night mode", async () => {
    const html = await displayHtml({ token: null, title: "Preview", previewView: "home", previewMode: "night" }).text();
    expect(html).toContain('data-preview="home"');
    expect(html).toContain('data-preview-mode="night"');
  });

  it("puts a different data-preview on each view (full preview must not stick on the first)", async () => {
    const home = await displayHtml({ token: null, title: "Preview", previewView: "home" }).text();
    const night = await displayHtml({ token: null, title: "Preview", previewView: "night" }).text();
    expect(home).toContain('data-preview="home"');
    expect(night).toContain('data-preview="night"');
    expect(home).not.toContain('data-preview="night"');
    expect(night).not.toContain('data-preview="home"');
  });

  it("lets the admin frame a preview, and keeps a wall display unframeable", () => {
    const wall = displayHtml({ token: "abc", title: "Kitchen" });
    expect(wall.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(wall.headers.get("X-Frame-Options")).toBeNull();

    const preview = displayHtml({ token: null, title: "Preview", previewView: "home" });
    expect(preview.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(preview.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
