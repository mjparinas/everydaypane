import { describe, expect, it } from "vitest";

import { trimBing } from "./bing";

describe("bing picture of the day", () => {
  it("parses Bing's JSON", () => {
    const photos = trimBing({
      images: [{ url: "/th?id=OHR.Langley_ZH-CN1234_1920x1080.jpg", width: 1920, height: 1080, startdate: "20261123" }],
    });
    expect(photos).toHaveLength(1);
    expect(photos[0]?.url).toContain("bing.com");
    expect(photos[0]?.taken).toBe("2026-11-23");
  });
});
