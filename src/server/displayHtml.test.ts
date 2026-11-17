import { describe, expect, it } from "vitest";

import { displayHtml } from "./displayHtml";

describe("display page", () => {
  it("can't be pinch-zoomed (Melvin, 2026-11-17)", async () => {
    const html = await displayHtml({ token: "abc", title: "Kitchen" }).text();
    expect(html).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1,user-scalable=no/);
  });
});
