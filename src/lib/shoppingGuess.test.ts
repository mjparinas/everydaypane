import { describe, expect, it } from "vitest";

import { groupByCategory } from "./shopping";
import { guessCategory } from "./shoppingGuess";

describe("guessCategory", () => {
  it("puts everyday groceries in their aisle", () => {
    expect(guessCategory("2% Milk")).toBe("dairy");
    expect(guessCategory("Eggs")).toBe("dairy");
    expect(guessCategory("Bananas")).toBe("produce");
    expect(guessCategory("strawberries")).toBe("produce");
    expect(guessCategory("Sourdough bread")).toBe("bakery");
    expect(guessCategory("ground beef")).toBe("meat");
    expect(guessCategory("Toilet paper")).toBe("household");
    expect(guessCategory("toothpaste")).toBe("personal");
    expect(guessCategory("orange juice")).toBe("drinks");
    expect(guessCategory("tomato sauce")).toBe("pantry");
  });

  it("lets the longer phrase win, and whole words only", () => {
    expect(guessCategory("peanut butter")).toBe("pantry");
    expect(guessCategory("dish soap")).toBe("household");
    expect(guessCategory("ice cream")).toBe("frozen");
    expect(guessCategory("frozen peas")).toBe("frozen");
    expect(guessCategory("popcorn")).toBe("snacks");
    expect(guessCategory("Birthday card")).toBe("other");
  });
});

describe("groupByCategory", () => {
  it("groups in store order, keeping each aisle's order, and leaves out empty aisles", () => {
    const items = [
      { id: "a", category: "dairy" as const },
      { id: "b", category: "produce" as const },
      { id: "c", category: "dairy" as const },
    ];
    expect(groupByCategory(items).map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
      ["produce", ["b"]],
      ["dairy", ["a", "c"]],
    ]);
  });
});
