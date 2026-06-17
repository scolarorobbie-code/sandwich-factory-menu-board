import type { CreateOrderResponse, Favorite, Loyalty, Order } from "@sf/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { addFavorite, getLoyalty, listFavorites, removeFavorite } from "../account";
import { createOrder, listOrders } from "../orders";
import { store, type StoredUser } from "../store";
import { mockEnv, mockUser, orderRequest } from "./fixtures";

const ITALIAN = "mock-item-italian";
const ITALIAN_6 = "mock-var-italian-6"; // $7.99
const HERB = "mock-mod-herb"; // +$0.50

function favoriteRequest(body: unknown): Request {
  return new Request("https://api.test/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("getLoyalty (mock mode)", () => {
  beforeEach(() => store.reset());

  it("returns the user's Stars balance and the reward ladder", async () => {
    const user = mockUser(75);
    const res = await getLoyalty(mockEnv(), user);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Loyalty;
    expect(body.stars).toBe(75);
    expect(body.earnRule).toContain("Star");
    expect(body.rewards.map((r) => r.cost)).toEqual([50, 100]);
    expect(body.rewards[0].value).toEqual({ amount: 500, currency: "USD" });
  });
});

describe("favorites create -> list -> delete roundtrip", () => {
  beforeEach(() => store.reset());

  const lineItems = [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [HERB] }];

  it("creates, lists, then deletes a favorite", async () => {
    const user = mockUser(0);

    // Empty to start.
    const empty = (await listFavorites(user).json()) as Favorite[];
    expect(empty).toEqual([]);

    // Create.
    const created = await addFavorite(favoriteRequest({ name: "My usual", lineItems }), mockEnv(), user);
    expect(created.status).toBe(201);
    const fav = (await created.json()) as Favorite;
    expect(fav.id).toBeTruthy();
    expect(fav.name).toBe("My usual");
    expect(fav.lineItems).toEqual(lineItems);

    // List shows it.
    const listed = (await listFavorites(user).json()) as Favorite[];
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(fav.id);

    // Delete it -> 204, then gone.
    const del = removeFavorite(fav.id, user);
    expect(del.status).toBe(204);
    const after = (await listFavorites(user).json()) as Favorite[];
    expect(after).toEqual([]);
  });

  it("404s deleting an unknown favorite", () => {
    const user = mockUser(0);
    expect(removeFavorite("nope", user).status).toBe(404);
  });

  it("422s when neither lineItems nor a usable source order is provided", async () => {
    const user = mockUser(0);
    const res = await addFavorite(favoriteRequest({ name: "Bad" }), mockEnv(), user);
    expect(res.status).toBe(422);
  });
});

describe("order history", () => {
  beforeEach(() => store.reset());

  async function placeFor(user: StoredUser): Promise<Order> {
    const res = await createOrder(
      orderRequest({ lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [HERB] }] }),
      mockEnv(),
      user,
    );
    const body = (await res.json()) as CreateOrderResponse;
    return body.order;
  }

  it("returns the user's orders with line items, newest first", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const first = await placeFor(user);
    const second = await placeFor(user);

    const res = listOrders(user);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Order[] };
    expect(body.items).toHaveLength(2);
    // Newest first.
    expect(body.items[0].id).toBe(second.id);
    expect(body.items[1].id).toBe(first.id);
    // Line items are carried through.
    expect(body.items[0].lineItems[0].name).toBe("Italian Sub");
    expect(body.items[0].lineItems[0].modifiers.map((m) => m.name)).toContain("Herb & Cheese");
  });

  it("does not leak another user's orders", async () => {
    const a = mockUser(0, { id: "user-a", email: "a@example.com" });
    const b = mockUser(0, { id: "user-b", email: "b@example.com" });
    store.putUser(a);
    store.putUser(b);
    await placeFor(a);

    const bodyB = (await listOrders(b).json()) as { items: Order[] };
    expect(bodyB.items).toEqual([]);

    const bodyA = (await listOrders(a).json()) as { items: Order[] };
    expect(bodyA.items).toHaveLength(1);
  });
});
