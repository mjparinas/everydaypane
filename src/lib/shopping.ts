// Shopping list aisles (Melvin, 2026-11-26: "add categories and running low"). A fixed, short list in the order most
// Lower Mainland grocery stores walk, so the wall and phones group the list the same way with nothing to set up. The
// display imports only this file; the keyword guess lives in `shoppingGuess.ts` so its word list stays off the wall.

export const SHOPPING_CATEGORIES = [
  "produce",
  "bakery",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "drinks",
  "snacks",
  "household",
  "personal",
  "other",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  produce: "Produce",
  bakery: "Bakery",
  dairy: "Dairy & eggs",
  meat: "Meat & seafood",
  pantry: "Pantry",
  frozen: "Frozen",
  drinks: "Drinks",
  snacks: "Snacks",
  household: "Household",
  personal: "Personal care",
  other: "Other",
};

export const isShoppingCategory = (v: unknown): v is ShoppingCategory =>
  typeof v === "string" && (SHOPPING_CATEGORIES as readonly string[]).includes(v);

/** Groups items by aisle in store order, keeping each aisle's items in the order given. Empty aisles are left out. */
export function groupByCategory<T extends { category: ShoppingCategory }>(
  items: readonly T[],
): { category: ShoppingCategory; items: T[] }[] {
  return SHOPPING_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}
