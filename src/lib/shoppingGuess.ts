import type { ShoppingCategory } from "./shopping";

// A first guess at an item's aisle from its words (Claude's default, 2026-11-26), so "2% milk" lands in Dairy without
// anyone picking. Anyone can move an item from a phone, and that choice is remembered for the same item next time
// (src/server/shopping.ts). Server and household panel only: the wall gets the category, never this list.

const WORDS: [ShoppingCategory, string[]][] = [
  ["frozen", ["frozen", "ice cream", "popsicle", "freezie", "waffles", "fries", "perogies", "pizza pocket"]],
  [
    "personal",
    [
      "shampoo",
      "conditioner",
      "toothpaste",
      "toothbrush",
      "floss",
      "deodorant",
      "soap",
      "body wash",
      "razor",
      "lotion",
      "sunscreen",
      "tampon",
      "pads",
      "diapers",
      "wipes",
      "vitamins",
      "tylenol",
      "advil",
      "bandaid",
      "band-aid",
      "mouthwash",
    ],
  ],
  [
    "household",
    [
      "paper towel",
      "toilet paper",
      "tissue",
      "kleenex",
      "dish soap",
      "dishwasher",
      "detergent",
      "laundry",
      "bleach",
      "garbage bag",
      "trash bag",
      "ziploc",
      "foil",
      "plastic wrap",
      "cling",
      "sponge",
      "batteries",
      "lightbulb",
      "light bulb",
      "cleaner",
      "windex",
      "dryer sheet",
      "napkin",
      "parchment",
    ],
  ],
  ["drinks", ["juice", "pop", "soda", "coffee", "tea", "sparkling", "water", "kombucha", "beer", "wine", "gatorade", "lemonade"]],
  ["dairy", ["milk", "cream", "cheese", "yogurt", "yoghurt", "butter", "eggs", "egg", "sour cream", "cottage", "kefir", "margarine"]],
  [
    "meat",
    [
      "chicken",
      "beef",
      "pork",
      "bacon",
      "ham",
      "sausage",
      "turkey",
      "salmon",
      "fish",
      "shrimp",
      "prawn",
      "tuna steak",
      "steak",
      "ground",
      "lamb",
      "deli",
      "salami",
      "pepperoni",
      "hot dog",
      "wieners",
      "tofu",
    ],
  ],
  ["bakery", ["bread", "bagel", "bun", "buns", "muffin", "croissant", "tortilla", "wrap", "pita", "naan", "baguette", "rolls", "cake"]],
  [
    "snacks",
    ["chips", "crackers", "cookies", "chocolate", "candy", "granola bar", "popcorn", "pretzels", "nuts", "goldfish", "fruit snacks", "gum"],
  ],
  [
    "produce",
    [
      "apple",
      "banana",
      "orange",
      "lemon",
      "lime",
      "grape",
      "berries",
      "strawberr",
      "blueberr",
      "raspberr",
      "pear",
      "peach",
      "plum",
      "mango",
      "melon",
      "avocado",
      "tomato",
      "potato",
      "onion",
      "garlic",
      "carrot",
      "celery",
      "lettuce",
      "spinach",
      "kale",
      "broccoli",
      "cauliflower",
      "cucumber",
      "pepper",
      "zucchini",
      "mushroom",
      "corn",
      "peas",
      "beans",
      "salad",
      "herbs",
      "cilantro",
      "parsley",
      "basil",
      "ginger",
      "squash",
      "cabbage",
      "fruit",
      "veg",
    ],
  ],
  [
    "pantry",
    [
      "rice",
      "pasta",
      "noodle",
      "flour",
      "sugar",
      "salt",
      "oil",
      "vinegar",
      "sauce",
      "ketchup",
      "mustard",
      "mayo",
      "cereal",
      "oats",
      "oatmeal",
      "peanut butter",
      "jam",
      "honey",
      "syrup",
      "soup",
      "broth",
      "stock",
      "canned",
      "beans",
      "lentils",
      "spice",
      "baking",
      "yeast",
      "vanilla",
      "tuna",
      "salsa",
      "spaghetti",
    ],
  ],
];

const fold = (s: string) => s.toLocaleLowerCase("en-CA").replace(/[^a-z0-9%\- ]+/g, " ");

const ends = (word: string) => [word, `${word}s`, `${word}es`, ...(word.endsWith("r") ? [`${word}ies`] : [])];

/**
 * The aisle a few plain words suggest, or Other. Whole words only (so "pop" isn't "popcorn"). The match that ends
 * last wins, because the last word names the thing ("orange juice" is a drink, "tomato sauce" pantry), then the
 * longer one ("peanut butter" is Pantry, not Dairy). "Frozen" anywhere means the freezer aisle.
 */
export function guessCategory(text: string): ShoppingCategory {
  const t = ` ${fold(text).replace(/\s+/g, " ").trim()} `;
  if (t.includes(" frozen ")) return "frozen";
  let best: ShoppingCategory = "other";
  let bestEnd = -1;
  let bestLength = 0;
  for (const [category, words] of WORDS) {
    for (const word of words) {
      for (const w of ends(word)) {
        const at = t.lastIndexOf(` ${w} `);
        if (at < 0) continue;
        const end = at + w.length;
        if (end > bestEnd || (end === bestEnd && word.length > bestLength)) {
          best = category;
          bestEnd = end;
          bestLength = word.length;
        }
      }
    }
  }
  return best;
}
