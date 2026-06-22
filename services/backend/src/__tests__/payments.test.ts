import type { CreateOrderResponse, CreatePaymentResponse, Order } from "@sf/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spy on push at the module boundary so payments tests never touch the network
// and we can assert staff + customer notifications fire. The real push module in
// mock mode only logs (mock tokens aren't real Expo tokens), but mocking it makes
// the assertions explicit and immune to any future network side effects.
vi.mock("../push", () => ({
  notifyStaffNewOrder: vi.fn(async () => {}),
  notifyCustomerStatus: vi.fn(async () => {}),
}));

import { createOrder } from "../orders";
import { createPayment, devAdvanceOrder } from "../payments";
import { notifyCustomerStatus, notifyStaffNewOrder } from "../push";
import { store, type StoredUser } from "../store";
import { mockEnv, mockUser, orderRequest } from "./fixtures";

const ITALIAN = "mock-item-italian";
const ITALIAN_6 = "mock-var-italian-6"; // $7.99

const staffSpy = vi.mocked(notifyStaffNewOrder);
const customerSpy = vi.mocked(notifyCustomerStatus);

function paymentRequest(body: unknown, idempotencyKey?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return new Request("https://api.test/payments", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Create a DRAFT order for the given user and return it. */
async function placeDraft(user: StoredUser): Promise<Order> {
  const res = await createOrder(
    orderRequest({ lineItems: [{ itemId: ITALIAN, variationId: ITALIAN_6, quantity: 1, modifierIds: [] }] }),
    mockEnv(),
    user,
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as CreateOrderResponse;
  return body.order;
}

describe("createPayment (mock mode)", () => {
  beforeEach(() => {
    store.reset();
    staffSpy.mockClear();
    customerSpy.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("pays a DRAFT order -> RECEIVED, awards stars, and notifies staff + customer", async () => {
    const user = mockUser(0);
    // The user must be in the store so the order is owned + push tokens resolve.
    user.pushTokens = [{ token: "mock-token-1", platform: "ios" }];
    store.putUser(user);

    const order = await placeDraft(user);
    expect(order.status).toBe("DRAFT");
    expect(order.starsEarned).toBeGreaterThan(0);

    const res = await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      user,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CreatePaymentResponse;
    expect(body.order.status).toBe("RECEIVED");
    expect(body.paymentId).toBeTruthy();

    // Stars accrued onto the user (mock-mode display mirror).
    expect(store.getUser(user.customer.id)?.stars).toBe(order.starsEarned);

    // Both notification audiences were invoked once.
    expect(staffSpy).toHaveBeenCalledTimes(1);
    expect(staffSpy).toHaveBeenCalledWith(expect.anything(), order.displayNumber, order.lineItems.length);
    expect(customerSpy).toHaveBeenCalledTimes(1);
    expect(customerSpy).toHaveBeenCalledWith(
      expect.anything(),
      user.pushTokens,
      order.displayNumber,
      expect.any(String),
    );
  });

  it("402s on the declined test nonce and leaves the order DRAFT", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await placeDraft(user);

    const res = await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-declined" }),
      mockEnv(),
      user,
    );
    expect(res.status).toBe(402);
    expect(store.getOrder(order.id)?.status).toBe("DRAFT");
    expect(staffSpy).not.toHaveBeenCalled();
    expect(customerSpy).not.toHaveBeenCalled();
  });

  it("409s when paying an order that is not DRAFT", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await placeDraft(user);
    // Pay once -> RECEIVED.
    const first = await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      user,
    );
    expect(first.status).toBe(200);
    // Pay again -> 409.
    const second = await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      user,
    );
    expect(second.status).toBe(409);
  });

  it("404s when paying an order you don't own", async () => {
    const owner = mockUser(0, { id: "owner-1", email: "owner@example.com" });
    store.putUser(owner);
    const order = await placeDraft(owner);

    const intruder = mockUser(0, { id: "intruder-1", email: "intruder@example.com" });
    store.putUser(intruder);
    const res = await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      intruder,
    );
    expect(res.status).toBe(404);
  });

  it("404s on an unknown order id", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const res = await createPayment(
      paymentRequest({ orderId: "nope", sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      user,
    );
    expect(res.status).toBe(404);
  });

  it("422s when the payment token is missing", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await placeDraft(user);
    const res = await createPayment(
      paymentRequest({ orderId: order.id }),
      mockEnv(),
      user,
    );
    expect(res.status).toBe(422);
  });
});

describe("devAdvanceOrder (sandbox/mock only)", () => {
  beforeEach(() => {
    store.reset();
    staffSpy.mockClear();
    customerSpy.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  async function receivedOrder(user: StoredUser): Promise<Order> {
    const order = await placeDraft(user);
    await createPayment(
      paymentRequest({ orderId: order.id, sourceId: "cnon:card-nonce-ok" }),
      mockEnv(),
      user,
    );
    return store.getOrder(order.id)!;
  }

  it("walks RECEIVED -> MAKING -> READY -> COMPLETED", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await receivedOrder(user);
    expect(order.status).toBe("RECEIVED");

    const env = mockEnv();
    for (const expected of ["MAKING", "READY", "COMPLETED"] as const) {
      const res = await devAdvanceOrder(order.id, env, user);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Order;
      expect(body.status).toBe(expected);
    }

    // Cannot advance past COMPLETED.
    const past = await devAdvanceOrder(order.id, env, user);
    expect(past.status).toBe(409);
  });

  it("403s outside sandbox (production environment)", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await placeDraft(user);
    const res = await devAdvanceOrder(order.id, mockEnv({ SQUARE_ENVIRONMENT: "production" }), user);
    expect(res.status).toBe(403);
  });

  it("403s in live mode even when sandbox", async () => {
    const user = mockUser(0);
    store.putUser(user);
    const order = await placeDraft(user);
    // Real Square creds present -> isLive(env) true -> dev advance is forbidden.
    const liveEnv = mockEnv({ SQUARE_ACCESS_TOKEN: "tok", SQUARE_LOCATION_ID: "loc" });
    const res = await devAdvanceOrder(order.id, liveEnv, user);
    expect(res.status).toBe(403);
  });

  it("404s advancing an order you don't own", async () => {
    const owner = mockUser(0, { id: "owner-2", email: "owner2@example.com" });
    store.putUser(owner);
    const order = await receivedOrder(owner);
    const intruder = mockUser(0, { id: "intruder-2", email: "intruder2@example.com" });
    store.putUser(intruder);
    const res = await devAdvanceOrder(order.id, mockEnv(), intruder);
    expect(res.status).toBe(404);
  });
});
