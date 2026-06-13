import type { Menu, Money } from "@sf/contract";

const usd = (cents: number): Money => ({ amount: cents, currency: "USD" });

/**
 * Contract-shaped mock menu. Stands in for the Square Catalog until real
 * sandbox credentials are connected. Content mirrors the in-store menu boards.
 * IDs are prefixed `mock-` so they're obviously not real Square object IDs.
 */
export const MOCK_MENU: Menu = {
  version: "mock-1",
  fetchedAt: new Date().toISOString(),
  categories: [
    {
      id: "mock-cat-subs",
      name: "Subs",
      ordinal: 0,
      items: [
        {
          id: "mock-item-italian",
          name: "Italian Sub",
          description: "Ham, salami, pepperoni, provolone, lettuce, tomato, onion.",
          available: true,
          variations: [
            { id: "mock-var-italian-6", name: "6 inch", price: usd(799), available: true },
            { id: "mock-var-italian-12", name: "Footlong", price: usd(1199), available: true },
          ],
          modifierGroups: [
            {
              id: "mock-mg-bread",
              name: "Choose your bread",
              minSelections: 1,
              maxSelections: 1,
              modifiers: [
                { id: "mock-mod-white", name: "White", price: usd(0), available: true, selectedByDefault: true },
                { id: "mock-mod-wheat", name: "Wheat", price: usd(0), available: true },
                { id: "mock-mod-herb", name: "Herb & Cheese", price: usd(50), available: true },
              ],
            },
            {
              id: "mock-mg-extras",
              name: "Add extras",
              minSelections: 0,
              maxSelections: 5,
              modifiers: [
                { id: "mock-mod-bacon", name: "Extra bacon", price: usd(150), available: true },
                { id: "mock-mod-avocado", name: "Avocado", price: usd(125), available: true },
                { id: "mock-mod-extra-cheese", name: "Extra cheese", price: usd(75), available: true },
              ],
            },
          ],
        },
        {
          id: "mock-item-turkey",
          name: "Turkey Club",
          description: "Roasted turkey, bacon, lettuce, tomato, mayo.",
          available: true,
          variations: [
            { id: "mock-var-turkey-6", name: "6 inch", price: usd(849), available: true },
            { id: "mock-var-turkey-12", name: "Footlong", price: usd(1249), available: true },
          ],
          modifierGroups: [
            {
              id: "mock-mg-bread-2",
              name: "Choose your bread",
              minSelections: 1,
              maxSelections: 1,
              modifiers: [
                { id: "mock-mod-white-2", name: "White", price: usd(0), available: true, selectedByDefault: true },
                { id: "mock-mod-wheat-2", name: "Wheat", price: usd(0), available: true },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "mock-cat-drinks",
      name: "Drinks",
      ordinal: 1,
      items: [
        {
          id: "mock-item-shake",
          name: "Milkshake",
          description: "Chocolate, vanilla, strawberry, Oreo, or peanut butter.",
          available: true,
          variations: [{ id: "mock-var-shake", name: "Regular", price: usd(499), available: true }],
          modifierGroups: [
            {
              id: "mock-mg-shake-flavor",
              name: "Flavor",
              minSelections: 1,
              maxSelections: 1,
              modifiers: [
                { id: "mock-mod-choc", name: "Chocolate", price: usd(0), available: true, selectedByDefault: true },
                { id: "mock-mod-van", name: "Vanilla", price: usd(0), available: true },
                { id: "mock-mod-straw", name: "Strawberry", price: usd(0), available: true },
                { id: "mock-mod-oreo", name: "Oreo", price: usd(0), available: true },
                { id: "mock-mod-pb", name: "Peanut Butter", price: usd(0), available: true },
              ],
            },
          ],
        },
        {
          id: "mock-item-fountain",
          name: "Fountain Drink",
          description: "Pepsi, Coke, and more.",
          available: true,
          variations: [
            { id: "mock-var-drink-sm", name: "Small", price: usd(199), available: true },
            { id: "mock-var-drink-md", name: "Medium", price: usd(249), available: true },
            { id: "mock-var-drink-lg", name: "Large", price: usd(299), available: true },
          ],
          modifierGroups: [],
        },
      ],
    },
    {
      id: "mock-cat-treats",
      name: "Sweet Treats",
      ordinal: 2,
      items: [
        {
          id: "mock-item-kitkat",
          name: "KitKat Crunch Cookie",
          description: "Our signature bakery creation.",
          available: true,
          variations: [{ id: "mock-var-kitkat", name: "Each", price: usd(299), available: true }],
          modifierGroups: [],
        },
        {
          id: "mock-item-cookie",
          name: "Fresh Baked Cookie",
          description: "Made in-house daily — ask for today's flavor.",
          available: true,
          variations: [{ id: "mock-var-cookie", name: "Each", price: usd(249), available: true }],
          modifierGroups: [],
        },
      ],
    },
  ],
};
