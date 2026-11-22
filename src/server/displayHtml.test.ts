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
});
