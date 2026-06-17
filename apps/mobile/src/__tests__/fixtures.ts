import type { Menu, MenuItem, Money, Order, OrderLineItem } from "@sf/contract";

/**
 * Small deterministic fixtures for the mobile pure-logic tests. No network, no
 * clock, no React Native. Mirrors the backend's __tests__/fixtures.ts spirit.
 */

export const usd = (amount: number): Money => ({ amount, currency: "USD" });

/**
 * A tiny menu: one category, one item ("Italian Beef") with two variations and
 * two modifiers (one free, one priced). Used by the reorder name-resolution and
 * cart-math tests.
 */
export function mockMenu(): Menu {
  const item: MenuItem = {
    id: "item-beef",
    name: "Italian Beef",
    variations: [
      { id: "var-regular", name: "Regular", price: usd(899), available: true },
      { id: "var-large", name: "Large", price: usd(1199), available: true },
    ],
    modifierGroups: [
      {
        id: "grp-bread",
        name: "Choose your bread",
        minSelections: 1,
        maxSelections: 1,
        modifiers: [
          { id: "mod-french", name: "French Roll", price: usd(0), available: true },
          { id: "mod-wheat", name: "Wheat", price: usd(0), available: true },
        ],
      },
      {
        id: "grp-extras",
        name: "Extras",
        minSelections: 0,
        maxSelections: 3,
        modifiers: [
          { id: "mod-cheese", name: "Extra Cheese", price: usd(100), available: true },
          { id: "mod-peppers", name: "Hot Peppers", price: usd(50), available: true },
          { id: "mod-soldout", name: "Sold Out Topping", price: usd(75), available: false },
        ],
      },
    ],
    available: true,
  };

  return {
    version: "test-v1",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    categories: [{ id: "cat-subs", name: "Subs", ordinal: 0, items: [item] }],
  };
}

/** Build an order line item with sensible defaults for reorder tests. */
export function orderLine(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    name: "Italian Beef",
    variationName: "Regular",
    quantity: 1,
    modifiers: [{ name: "Extra Cheese", price: usd(100) }],
    total: usd(999),
    ...overrides,
  };
}

/** Build a past order from a list of line items. */
export function mockOrder(lineItems: OrderLineItem[]): Order {
  return {
    id: "order-1",
    squareOrderId: "sq-order-1",
    displayNumber: "1043",
    status: "COMPLETED",
    lineItems,
    subtotal: usd(999),
    tax: usd(0),
    discount: usd(0),
    total: usd(999),
    pickup: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
