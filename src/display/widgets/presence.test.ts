// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { presenceWhere } from "./presence";

describe("who's home", () => {
  it("treats home and an on sensor as home, and says where someone else is", () => {
    expect(presenceWhere("home")).toEqual({ home: true, where: "Home" });
    expect(presenceWhere("on")).toEqual({ home: true, where: "Home" });
    expect(presenceWhere("not_home")).toEqual({ home: false, where: "Away" });
    expect(presenceWhere("off")).toEqual({ home: false, where: "Away" });
    expect(presenceWhere("Work")).toEqual({ home: false, where: "Work" });
    expect(presenceWhere("unavailable")).toEqual({ home: false, where: "Unavailable" });
  });
});
