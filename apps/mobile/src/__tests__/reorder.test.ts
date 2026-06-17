import { describe, expect, it } from "vitest";
import { planReorder } from "../reorder";
import { mockMenu, mockOrder, orderLine } from "./fixtures";

/**
 * planReorder resolves a PAST order's display-only line items (item/variation/
 * modifier NAMES) back to the current menu's ids. Anything renamed/removed/sold
 * out is skipped and counted so the UI can tell the customer.
 */
describe("planReorder", () => {
  it("resolves item, variation, and modifier names to current menu ids", () => {
    const order = mockOrder([
      orderLine({
        name: "Italian Beef",
        variationName: "Large",
        quantity: 2,
        modifiers: [{ name: "Extra Cheese", price: { amount: 100, currency: "USD" } }],
        note: "no peppers",
      }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.skipped).toBe(0);
    expect(plan.total).toBe(1);
    expect(plan.lineItems).toEqual([
      {
        itemId: "item-beef",
        variationId: "var-large",
        quantity: 2,
        modifierIds: ["mod-cheese"],
        note: "no peppers",
      },
    ]);
  });

  it("matches names case- and whitespace-insensitively", () => {
    const order = mockOrder([
      orderLine({
        name: "  italian BEEF ",
        variationName: "rEgUlAr",
        modifiers: [{ name: " extra cheese ", price: { amount: 100, currency: "USD" } }],
      }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.skipped).toBe(0);
    expect(plan.lineItems[0]).toMatchObject({
      itemId: "item-beef",
      variationId: "var-regular",
      modifierIds: ["mod-cheese"],
    });
  });

  it("skips an item that was renamed/removed from the menu and counts it", () => {
    const order = mockOrder([
      orderLine({ name: "Discontinued Sandwich" }),
      orderLine({ name: "Italian Beef", variationName: "Regular", modifiers: [] }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.total).toBe(2);
    expect(plan.skipped).toBe(1);
    expect(plan.lineItems).toHaveLength(1);
    expect(plan.lineItems[0].itemId).toBe("item-beef");
  });

  it("drops modifiers that no longer match but keeps the line", () => {
    const order = mockOrder([
      orderLine({
        name: "Italian Beef",
        variationName: "Regular",
        modifiers: [
          { name: "Extra Cheese", price: { amount: 100, currency: "USD" } },
          { name: "Avocado (removed)", price: { amount: 150, currency: "USD" } },
          { name: "Sold Out Topping", price: { amount: 75, currency: "USD" } },
        ],
      }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.skipped).toBe(0);
    // Only the available, name-matched modifier survives.
    expect(plan.lineItems[0].modifierIds).toEqual(["mod-cheese"]);
  });

  it("skips a line whose variation name no longer exists", () => {
    const order = mockOrder([
      orderLine({ name: "Italian Beef", variationName: "Footlong", modifiers: [] }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.skipped).toBe(1);
    expect(plan.lineItems).toHaveLength(0);
  });

  it("floors and clamps quantity to at least 1", () => {
    const order = mockOrder([
      orderLine({ name: "Italian Beef", variationName: "Regular", quantity: 2.9, modifiers: [] }),
    ]);

    const plan = planReorder(mockMenu(), order);

    expect(plan.lineItems[0].quantity).toBe(2);
  });
});
