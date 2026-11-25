// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reloadForRelease } from "./release";

describe("reloadForRelease", () => {
  beforeEach(() => localStorage.clear());

  it("reloads once for a new release, then keeps running if the page still names the old one", () => {
    const reload = vi.fn();
    expect(reloadForRelease("release-v2", reload)).toBe(true);
    // The page came back with the old data-v (a stale copy of the page): no second reload, no loop.
    expect(reloadForRelease("release-v2", reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again for the next release", () => {
    const reload = vi.fn();
    reloadForRelease("release-v2", reload);
    expect(reloadForRelease("release-v3", reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never reloads when storage is unavailable", () => {
    const reload = vi.fn();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(reloadForRelease("release-v2", reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    get.mockRestore();
  });
});
