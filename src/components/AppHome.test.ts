import { describe, expect, it } from "vitest";

import { tabFromHash } from "./AppHome";

describe("tabFromHash", () => {
  it("opens the tab the address names", () => {
    expect(tabFromHash("#shopping")).toBe("shopping");
    expect(tabFromHash("#Meals")).toBe("meals");
    expect(tabFromHash("chores")).toBe("chores");
    expect(tabFromHash("#more")).toBe("more");
  });

  it("falls back to Notes for an empty or unknown hash", () => {
    expect(tabFromHash("")).toBe("notes");
    expect(tabFromHash("#")).toBe("notes");
    expect(tabFromHash("#settings")).toBe("notes");
  });
});
