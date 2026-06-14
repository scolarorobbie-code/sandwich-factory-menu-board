import type { CreatePaymentRequest, CreatePaymentResponse, Order } from "@sf/contract";
import { isLive, type Env } from "./env";
import { notifyCustomerStatus, notifyStaffNewOrder } from "./push";
import { error, json } from "./responses";
import { squareFetch } from "./square";
import { store, type StoredUser } from "./store";

/**
 * Charge a previously-created order using the on-device card token (sourceId).
 * The token is opaque — we never see raw card data (hard rule #2).
 *
 * On success the order moves DRAFT -> RECEIVED and the staff tablet is alerted.
 * In production the staff alert is driven by Square's order.created webhook;
 * in mock mode we trigger it here so the loop is observable without Square.
 */
export async function createPayment(req: Request, env: Env, user: StoredUser): Promise<Response> {
  const body = (await req.json()) as CreatePaymentRequest;
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? crypto.randomUUID();

  const order = store.getOrder(body.orderId ?? "");
  const ownsOrder = order && store.listOrders(user.customer.id).some((o) => o.id === order.id);
  if (!order || !ownsOrder) return error("NOT_FOUND", "Order not found", 404);
  if (order.status !== "DRAFT") return error("CONFLICT", "Order already paid", 409);
  if (!body.sourceId) return error("VALIDATION_FAILED", "Missing payment token", 422);

  let paymentId: string;
  let receiptUrl: string | undefined;

  if (isLive(env)) {
    const res = await squareFetch(env, "/v2/payments", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        source_id: body.sourceId,
        verification_token: body.verificationToken,
        order_id: order.squareOrderId,
        location_id: env.SQUARE_LOCATION_ID,
        amount_money: { amount: order.total.amount, currency: order.total.currency },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return error("PAYMENT_DECLINED", "Payment was declined", 402, detail);
    }
    const data = (await res.json()) as { payment?: { id: string; receipt_url?: string } };
    paymentId = data.payment?.id ?? `sq-${idempotencyKey}`;
    receiptUrl = data.payment?.receipt_url;
    // order.created webhook will notify staff; we just mark RECEIVED locally.
  } else {
    // Mock: the Square sandbox test card "cnon:card-nonce-ok" always succeeds.
    if (body.sourceId === "cnon:card-nonce-declined") {
      return error("PAYMENT_DECLINED", "Card was declined (test)", 402);
    }
    paymentId = `mock-pay-${idempotencyKey.slice(0, 8)}`;
  }

  const paid: Order = { ...order, status: "RECEIVED", updatedAt: new Date().toISOString() };
  store.putOrder(user.customer.id, paid);

  // Award Stars (production: Square Loyalty accrual event from the payment).
  user.stars += paid.starsEarned ?? 0;
  store.putUser(user);

  if (!isLive(env)) {
    await notifyStaffNewOrder(env, paid.displayNumber, paid.lineItems.length);
    await notifyCustomerStatus(env, user.pushTokens, paid.displayNumber, "Order received — we're on it!");
  }

  const out: CreatePaymentResponse = { order: paid, paymentId, receiptUrl };
  return json(out);
}

const NEXT_STATUS: Record<string, Order["status"] | undefined> = {
  RECEIVED: "MAKING",
  MAKING: "READY",
  READY: "COMPLETED",
};

const STATUS_MESSAGE: Partial<Record<Order["status"], string>> = {
  MAKING: "We're making your order now 👨‍🍳",
  READY: "Your order is ready for pickup! 🥪",
  COMPLETED: "Thanks for picking up — see you next time!",
};

/**
 * DEV ONLY (sandbox + mock): advance an order's status one step and push the
 * customer, so the status flow is testable without Square's POS firing webhooks.
 * In production this transition is driven by the order.updated webhook.
 */
export async function devAdvanceOrder(orderId: string, env: Env, user: StoredUser): Promise<Response> {
  if (env.SQUARE_ENVIRONMENT !== "sandbox" || isLive(env)) {
    return error("FORBIDDEN", "Not available", 403);
  }
  const order = store.getOrder(orderId);
  if (!order || !store.listOrders(user.customer.id).some((o) => o.id === orderId)) {
    return error("NOT_FOUND", "Order not found", 404);
  }
  const next = NEXT_STATUS[order.status];
  if (!next) return error("CONFLICT", `Cannot advance from ${order.status}`, 409);

  const updated: Order = { ...order, status: next, updatedAt: new Date().toISOString() };
  store.putOrder(user.customer.id, updated);
  const message = STATUS_MESSAGE[next];
  if (message) await notifyCustomerStatus(env, user.pushTokens, updated.displayNumber, message);
  return json(updated);
}
