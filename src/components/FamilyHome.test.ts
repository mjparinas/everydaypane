import { describe, expect, it } from "vitest";

import { familyTabFromHash } from "./FamilyHome";

describe("familyTabFromHash", () => {
  it("opens the tab the address names, and Notes otherwise", () => {
    expect(familyTabFromHash("#shopping")).toBe("shopping");
    expect(familyTabFromHash("#Meals")).toBe("meals");
    expect(familyTabFromHash("#more")).toBe("more");
    expect(familyTabFromHash("")).toBe("notes");
    expect(familyTabFromHash("#")).toBe("notes");
    expect(familyTabFromHash("#settings")).toBe("notes");
  });
});
