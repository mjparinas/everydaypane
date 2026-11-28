import { describe, expect, it } from "vitest";

import { dueLabel } from "./FamilyTasks";

describe("dueLabel", () => {
  const today = new Date(2026, 10, 28, 15, 0);
  it("names today, tomorrow and later days", () => {
    expect(dueLabel("2026-11-28", today)).toBe("Due Today");
    expect(dueLabel("2026-11-29", today)).toBe("Due Tomorrow");
    expect(dueLabel("2026-12-04", today)).toBe("Due Dec 4");
    expect(dueLabel("2026-11-20", today)).toBe("Overdue");
    expect(dueLabel("nope", today)).toBe("");
  });
});
