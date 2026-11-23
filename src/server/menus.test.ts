import { describe, expect, it } from "vitest";

import { parseNutrisliceDay } from "./menus";

describe("Nutrislice mapping", () => {
  it("reads menu item names from a flat menu_items list", () => {
    expect(parseNutrisliceDay({ menu_items: [{ food: { name: "Pancakes" } }, { name: "Fruit cup" }] }, "breakfast")).toEqual([
      "Pancakes",
      "Fruit cup",
    ]);
  });

  it("picks the lunch section from menu_types", () => {
    expect(
      parseNutrisliceDay(
        {
          menu_types: [
            { name: "Lunch Menu", sections: [{ menu_items: [{ food: { name: "Pizza" } }] }] },
            { name: "Breakfast", sections: [{ menu_items: [{ food: { name: "Toast" } }] }] },
          ],
        },
        "lunch",
      ),
    ).toEqual(["Pizza"]);
  });
});
