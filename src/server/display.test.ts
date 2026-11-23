import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";

import { displayPayload } from "./display";

// Kept so the server re-export stays covered; the cases live in src/lib/display/payload.test.ts.
describe("display payload re-export", () => {
  it("builds a preview payload", () => {
    expect(displayPayload(defaultConfig(), 1, null, "calendar").views.map((v) => v.id)).toEqual(["calendar"]);
  });
});
