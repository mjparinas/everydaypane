import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { newWidget } from "@/lib/config/widgets";

import { clearMemoryCache } from "./cache";
import { packagesFeed } from "./packages";

describe("packages feed", () => {
  it("lists widget packages with unknown status when no API key", async () => {
    clearMemoryCache();
    const config = defaultConfig();
    config.views[0]?.widgets.push({
      ...newWidget("packages", "pkg1", { x: 0, y: 0 }),
      packages: [{ id: "p1", carrier: "canadaPost", trackingNumber: "123456789012", label: "Books" }],
    });
    const data = await packagesFeed("acct_test", config, 1);
    expect(data.value.trackingConfigured).toBe(false);
    expect(data.value.packages[0]).toMatchObject({ trackingNumber: "123456789012", status: "unknown", label: "Books" });
  });
});
