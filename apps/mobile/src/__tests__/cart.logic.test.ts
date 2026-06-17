import { describe, expect, it } from "vitest";
import { type CartEntry, entryTotal, entryUnitPrice } from "../state/cart.logic";
import { usd } from "./fixtures";

/**
 * Cart price math (cents). entryUnitPrice = variation price + sum(modifier
 * prices); entryTotal = unit price × quantity. Pure — no React, no RN.
 */
function entry(overrides: Partial<CartEntry> = {}): CartEntry {
  return {
    key: "k1",
    itemId: "item-beef",
    itemName: "Italian Beef",
    variation: { id: "var-regular", name: "Regular", price: usd(899), available: true },
    modifiers: [],
    quantity: 1,
    ...overrides,
  };
}

describe("cart math", () => {
  it("unit price is the variation price when there are no modifiers", () => {
    expect(entryUnitPrice(entry())).toBe(899);
  });

  it("unit price adds every modifier price", () => {
    const e = entry({
      modifiers: [
        { id: "mod-cheese", name: "Extra Cheese", price: usd(100), available: true },
        { id: "mod-peppers", name: "Hot Peppers", price: usd(50), available: true },
      ],
    });
    expect(entryUnitPrice(e)).toBe(899 + 100 + 50);
  });

  it("free (zero-price) modifiers do not change the unit price", () => {
    const e = entry({
      modifiers: [{ id: "mod-french", name: "French Roll", price: usd(0), available: true }],
    });
    expect(entryUnitPrice(e)).toBe(899);
  });

  it("total is unit price multiplied by quantity", () => {
    const e = entry({
      quantity: 3,
      modifiers: [{ id: "mod-cheese", name: "Extra Cheese", price: usd(100), available: true }],
    });
    // (899 + 100) * 3
    expect(entryTotal(e)).toBe(2997);
  });

  it("total of a single plain item equals its variation price", () => {
    expect(entryTotal(entry())).toBe(899);
  });
});
