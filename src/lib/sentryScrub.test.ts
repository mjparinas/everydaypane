import { describe, expect, it } from "vitest";

import { scrubEvent } from "./sentryScrub";

describe("scrubEvent", () => {
  it("redacts 8-character display tokens in /d/ paths (and longer legacy ones)", () => {
    const event = scrubEvent({
      message: "fail at https://pane.example/d/AbCdEf12/ and /d/legacyTokenValue99/api",
      request: { url: "https://pane.example/d/XyZ9ab12/api/display/state/?t=rawTokenHere" },
    } as never);
    expect(event.message).toContain("/d/[redacted]");
    expect(event.message).not.toMatch(/AbCdEf12|legacyTokenValue99/);
    expect(event.request?.url).toContain("/d/[redacted]");
    expect(event.request?.url).toContain("t=[redacted]");
    expect(event.request?.url).not.toContain("XyZ9ab12");
    expect(event.request?.url).not.toContain("rawTokenHere");
  });
});
