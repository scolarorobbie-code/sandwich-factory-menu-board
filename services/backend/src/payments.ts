import type { CreatePaymentRequest, CreatePaymentResponse, Order } from "@sf/contract";
import { isLive, type Env } from "./env";
import { accumulatePoints, findOrCreateLoyaltyAccount, getLoyaltyProgram } from "./loyalty";
import { notifyCustomerStatus, notifyStaffNewOrder } from "./push";
import { error, json } from "./responses";
import { squareFetch } from "./square";
import { store, type StoredUser } from "./store";

/**
 * LIVE-mode loyalty earn. Square calculates the points from its own accrual
 * rules tied to the paid order; we just resolve the customer's loyalty account
 * (by phone) and trigger accumulation. Fully best-effort: a missing loyalty
 * program, a customer with no phone, or any Square hiccup must NEVER fail a
 * completed payment — we just skip earning. Square stays the source of truth, so
 * we mirror the accrued points onto `user.stars` only for display.
 */
async function earnLoyalty(
  env: Env,
  user: StoredUser,
  squareOrderId: string,
  idempotencyKey: string,
  paid: Order,
): Promise<void> {
  try {
    const program = await getLoyaltyProgram(env);
    if (!program) return; // no Square loyalty program configured → no earning

    const accountId =
      user.loyaltyAccountId ??
      (await findOrCreateLoyaltyAccount(env, program.programId, user.customer.phone)) ??
      undefined;
    if (!accountId) return; // e.g. customer has no usable phone for a loyalty mapping

    if (user.loyaltyAccountId !== accountId) {
      user.loyaltyAccountId = accountId;
      store.putUser(user);
    }

    // Idempotency-keyed so a retried payment never double-earns.
    const points = await accumulatePoints(env, accountId, squareOrderId, `earn-${idempotencyKey}`);
    if (points !== null) {
      paid.starsEarned = points; // reflect Square's authoritative accrual
      store.putOrder(user.customer.id, paid);
      user.stars += points; // display mirror only; Square is source of truth
      store.putUser(user);
    }
  } catch {
    // Never let loyalty break a paid order.
  }
}

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
      // Log Square's full detail server-side; return only a generic message to
      // the client (don't leak Square's internal decline payload to the app).
      console.warn(`[payments] Square decline ${res.status}: ${await res.text()}`);
      return error("PAYMENT_DECLINED", "Payment was declined", 402);
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

  // Award Stars. LIVE mode: Square Loyalty is the source of truth — accumulate
  // points against the paid Square order. Mock mode: keep the local increment so
  // the app still demos without a Square loyalty program.
  if (isLive(env)) {
    await earnLoyalty(env, user, order.squareOrderId, idempotencyKey, paid);
  } else {
    user.stars += paid.starsEarned ?? 0;
    store.putUser(user);
  }

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
