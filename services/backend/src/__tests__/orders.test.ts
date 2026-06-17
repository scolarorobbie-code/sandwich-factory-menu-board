import type { CreateOrderResponse, Menu } from "@sf/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, priceLine } from "../orders";
import { MOCK_MENU } from "../mocks/menu";
import { overridesStore } from "../overrides";
import { store } from "../store";
import { mockEnv, mockUser, orderRequest } from "./fixtures";

const menu: Menu = MOCK_MENU;

// Convenience ids from the mock menu (services/backend/src/mocks/menu.ts).
const ITALIAN = "mock-item-italian";
const ITALIAN_6 = "mock-var-italian-6"; // $7.99
const ITALIAN_12 = "mock-var-italian-12"; // $11.99
const TURKEY = "mock-item-turkey";
const TURKEY_12 = "mock-var-turkey-12"; // $12.49
const HERB = "mock-mod-herb"; // +$0.50
const BACON = "mock-mod-bacon"; // +$1.50

describe("priceLine", () => {
  it("computes (unit + modifiers) × quantity", () => {
    const line = priceLine(menu, {
      itemId: ITALIAN,
      variationId: ITALIAN_6,
      quantity: 2,
      modifierIds: [HERB, BACON], // 50 + 150
    });
    // (799 + 50 + 150) * 2 = 1998
    expect(line.total).toEqual({ amount: 1998, currency: "USD" });
    expect(line.quantity).toBe(2);
    expect(line.name).toBe("Italian Sub");
    expect(line.variationName).toBe("6 inch");
    expect(line.modifiers.map((m) => m.name)).toEqual(["Herb & Cheese", "Extra bacon"]);
  });

  it("defaults a fractional/zero quantity up to at least 1", () => {
    const line = priceLine(menu, {
      itemId: ITALIAN,
      variationId: ITALIAN_6,
      quantity: 0,
      modifierIds: [],
    });
    expect(line.quantity).toBe(1);
    expect(line.total).toEqual({ amount: 799, currency: "USD" });
  });

  it("throws on an unknown item", () => {
    expect(() =>
      priceLine(menu, { itemId: "nope", variationId: ITALIAN_6, quantity: 1, modifierIds: [] }),
    ).toThrow(/Unknown item/);
  });

  it("throws on an unknown variation", () => {
    expect(() =>
      priceLine(menu, { itemId: ITALIAN, variationId: "nope", quantity: 1, modifierIds: [] }),
    ).toThrow(/Unknown variation/);
  });

  it("throws on an unknown modifier", () => {
    expect(() =>
      priceLine(menu, { itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: ["nope"] }),
    ).toThrow(/Unknown modifier/);
  });

  it("rejects an unavailable item", () => {
    const m = structuredClone(menu);
    m.categories[0].items[0].available = false;
    expect(() =>
      priceLine(m, { itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }),
    ).toThrow(/unavailable/);
  });

  it("rejects an unavailable variation", () => {
    const m = structuredClone(menu);
    m.categories[0].items[0].variations[0].available = false;
    expect(() =>
      priceLine(m, { itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }),
    ).toThrow(/unavailable/);
  });

  it("rejects an unavailable modifier", () => {
    const m = structuredClone(menu);
    const bacon = m.categories[0].items[0].modifierGroups[1].modifiers.find((x) => x.id === BACON)!;
    bacon.available = false;
    expect(() =>
      priceLine(m, { itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [BACON] }),
    ).toThrow(/unavailable/);
  });
});

async function place(body: unknown, user = mockUser()): Promise<CreateOrderResponse> {
  const res = await createOrder(orderRequest(body), mockEnv(), user);
  expect(res.status).toBe(201);
  return (await res.json()) as CreateOrderResponse;
}

describe("createOrder (mock-mode tax / discount / Stars math)", () => {
  beforeEach(() => {
    store.reset();
    overridesStore.reset();
  });

  it("422s on an empty order", async () => {
    const res = await createOrder(orderRequest({ lineItems: [] }), mockEnv(), mockUser());
    expect(res.status).toBe(422);
  });

  it("422s (ITEM_UNAVAILABLE) on a bad line item", async () => {
    const res = await createOrder(
      orderRequest({ lineItems: [{ itemId: "nope", variationId: "x", quantity: 1, modifierIds: [] }] }),
      mockEnv(),
      mockUser(),
    );
    expect(res.status).toBe(422);
    const err = (await res.json()) as { error: { code: string } };
    expect(err.error.code).toBe("ITEM_UNAVAILABLE");
  });

  it("computes 9.75% tax on the subtotal with no discount", async () => {
    const { order } = await place({
      lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [HERB] }],
    });
    // subtotal = 799 + 50 = 849; tax = round(849 * 0.0975) = 83; total = 932
    expect(order.subtotal.amount).toBe(849);
    expect(order.discount.amount).toBe(0);
    expect(order.tax.amount).toBe(83);
    expect(order.total.amount).toBe(932);
    expect(order.starsEarned).toBe(8); // floor(849 / 100)
  });

  it("sets a pickup.readyEta in the future (drives the order-status ETA)", async () => {
    const before = Date.now();
    const { order } = await place({
      lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }],
    });
    expect(order.pickup?.readyEta).toBeTruthy();
    const eta = new Date(order.pickup!.readyEta!).getTime();
    // Default prep floor is 10 min, so the ETA must be at least ~10 min out.
    expect(eta).toBeGreaterThanOrEqual(before + 9 * 60_000);
  });

  it("applies the free-cookie deal ($2.49 off) once subtotal >= $15", async () => {
    const { order } = await place({
      lineItems: [
        { itemId: ITALIAN, variationId: ITALIAN_12, quantity: 1, modifierIds: [] }, // 1199
        { itemId: TURKEY, variationId: TURKEY_12, quantity: 1, modifierIds: [] }, // 1249
      ],
      dealId: "deal-free-cookie",
    });
    // subtotal 2448; discount 249; tax = round((2448-249)*0.0975) = 214; total = 2413
    expect(order.subtotal.amount).toBe(2448);
    expect(order.discount.amount).toBe(249);
    expect(order.tax.amount).toBe(214);
    expect(order.total.amount).toBe(2413);
  });

  it("does NOT apply the free-cookie deal below $15", async () => {
    const { order } = await place({
      lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }], // 799
      dealId: "deal-free-cookie",
    });
    expect(order.discount.amount).toBe(0);
  });

  it("does NOT discount when the deal has been disabled in the control panel", async () => {
    // Owner toggled the free-cookie deal off — the override path must respect it.
    await overridesStore.put(mockEnv(), {
      items: {},
      deals: {
        "deal-free-cookie": {
          dealId: "deal-free-cookie",
          title: "Free cookie over $15",
          description: "x",
          enabled: false,
          discount: { kind: "freeItem", amountCents: 249, minSubtotalCents: 1500 },
        },
      },
    });
    const { order } = await place({
      lineItems: [
        { itemId: ITALIAN, variationId: ITALIAN_12, quantity: 1, modifierIds: [] }, // 1199
        { itemId: TURKEY, variationId: TURKEY_12, quantity: 1, modifierIds: [] }, // 1249
      ],
      dealId: "deal-free-cookie",
    });
    expect(order.discount.amount).toBe(0);
  });

  it("applies a panel-defined amountOff deal at checkout", async () => {
    await overridesStore.put(mockEnv(), {
      items: {},
      deals: {
        "deal-5off": {
          dealId: "deal-5off",
          title: "$5 off",
          description: "x",
          discount: { kind: "amountOff", amountCents: 500 },
        },
      },
    });
    const { order } = await place({
      lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_12, quantity: 1, modifierIds: [] }], // 1199
      dealId: "deal-5off",
    });
    expect(order.discount.amount).toBe(500);
  });

  it("redeems Stars in blocks of 50 = $5 (capped at user balance)", async () => {
    // 50 Stars = $5. User has 70 Stars, asks to redeem 100 -> redeemable=70 ->
    // 1 block -> $5 off.
    const { order } = await place(
      {
        lineItems: [
          { itemId: ITALIAN, variationId: ITALIAN_12, quantity: 1, modifierIds: [] }, // 1199
          { itemId: TURKEY, variationId: TURKEY_12, quantity: 1, modifierIds: [] }, // 1249
        ],
        redeemStars: 100,
      },
      mockUser(70),
    );
    expect(order.discount.amount).toBe(500);
    // subtotal 2448; tax = round((2448-500)*0.0975) = 190; total = 2138
    expect(order.subtotal.amount).toBe(2448);
    expect(order.tax.amount).toBe(190);
    expect(order.total.amount).toBe(2138);
  });

  it("redeems multiple blocks of 50 Stars", async () => {
    const { order } = await place(
      {
        lineItems: [
          { itemId: ITALIAN, variationId: ITALIAN_12, quantity: 1, modifierIds: [] }, // 1199
          { itemId: TURKEY, variationId: TURKEY_12, quantity: 1, modifierIds: [] }, // 1249
        ],
        redeemStars: 100,
      },
      mockUser(120), // can afford 2 full blocks
    );
    expect(order.discount.amount).toBe(1000);
  });

  it("caps the Stars discount at the subtotal (never negative total)", async () => {
    const { order } = await place(
      {
        lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }], // 799
        redeemStars: 100,
      },
      mockUser(100), // 2 blocks = $10, but subtotal is only $7.99
    );
    expect(order.discount.amount).toBe(799);
    expect(order.tax.amount).toBe(0);
    expect(order.total.amount).toBe(0);
  });

  it("ignores Stars below one full 50-Star block", async () => {
    const { order } = await place(
      {
        lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }],
        redeemStars: 40,
      },
      mockUser(40),
    );
    expect(order.discount.amount).toBe(0);
  });
});
