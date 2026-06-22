import type { Order, OrderStatus, SquareWebhookEvent } from "@sf/contract";
import type { Env } from "./env";
import { notifyCustomerStatus, notifyStaffNewOrder } from "./push";
import { error, json } from "./responses";
import { store } from "./store";

/**
 * Square webhook receiver. Hard rules #3 (verify signature) and #4 (idempotency).
 *
 * Square signs the request with HMAC-SHA256 over (notificationUrl + rawBody),
 * base64-encoded, in the `x-square-hmacsha256-signature` header. We must verify
 * against the RAW body before parsing, then de-dupe on `event_id`.
 */
export async function handleSquareWebhook(req: Request, env: Env): Promise<Response> {
  const signature = req.headers.get("x-square-hmacsha256-signature");
  const rawBody = await req.text();

  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    // Mock mode: no signing key configured. Refuse rather than trust blindly.
    return error("INTERNAL", "Webhook signature key not configured", 503);
  }
  if (!signature) {
    return error("UNAUTHENTICATED", "Missing signature", 401);
  }

  const notificationUrl = req.url; // must match the URL registered in Square
  const valid = await verifySignature(env.SQUARE_WEBHOOK_SIGNATURE_KEY, notificationUrl, rawBody, signature);
  if (!valid) {
    return error("UNAUTHENTICATED", "Invalid signature", 401);
  }

  const event = JSON.parse(rawBody) as Partial<SquareWebhookEvent>;
  if (!event.event_id) {
    return error("VALIDATION_FAILED", "Missing event_id", 422);
  }

  // Idempotency: process each event_id at most once (hard rule #4) — checked +
  // marked BEFORE we notify, so one order never pushes/alerts twice.
  if (await alreadyProcessed(env, event.event_id)) {
    return json({ status: "duplicate-ignored" });
  }
  await markProcessed(env, event.event_id);

  // React to the event. Notifications are best-effort and must never make us
  // return non-200 to Square (that would trigger Square retries against an event
  // we've already de-duped). Swallow errors after the dedupe mark.
  try {
    await dispatchEvent(env, event as SquareWebhookEvent);
  } catch (err) {
    console.warn(`[webhook] handler error for ${event.type}: ${err instanceof Error ? err.message : err}`);
  }

  return json({ status: "accepted", type: event.type });
}

/**
 * Branch on the Square event type and fire the right push (per CLAUDE.md flow):
 *   order.created             -> alert the STAFF tablet ("New order #1043")
 *   order.updated             -> push the CUSTOMER when fulfillment changes
 *   order.fulfillment.updated -> same (fulfillment-state change)
 *
 * We map the Square order id back to OUR order (which carries the display number
 * + owner's push tokens). Unknown orders (e.g. created in the POS, not the app)
 * are ignored for customer pushes but still alert staff.
 */
async function dispatchEvent(env: Env, event: SquareWebhookEvent): Promise<void> {
  const squareOrderId = extractSquareOrderId(event);

  switch (event.type) {
    case "order.created": {
      const found = squareOrderId ? store.getBySquareOrderId(squareOrderId) : undefined;
      const displayNumber = found?.order.displayNumber ?? squareOrderId?.slice(-4) ?? "—";
      const itemCount = found?.order.lineItems.length ?? 1;
      await notifyStaffNewOrder(env, displayNumber, itemCount);
      return;
    }
    case "order.updated":
    case "order.fulfillment.updated": {
      if (!squareOrderId) return;
      const found = store.getBySquareOrderId(squareOrderId);
      if (!found) return; // not one of our app orders
      const state = extractFulfillmentState(event);
      const status = FULFILLMENT_TO_STATUS[state ?? ""];
      if (!status) return; // a state we don't surface to the customer
      const message = STATUS_MESSAGE[status];
      if (!message) return;

      // Keep our order's status in sync, then push the customer.
      const updated: Order = { ...found.order, status, updatedAt: new Date().toISOString() };
      store.putOrder(found.user.customer.id, updated);
      await notifyCustomerStatus(env, found.user.pushTokens, updated.displayNumber, message);
      return;
    }
    default:
      return; // catalog.version.updated, payment.completed, etc. — not handled here
  }
}

/** Pull the Square order id out of an order.* webhook payload. */
function extractSquareOrderId(event: SquareWebhookEvent): string | undefined {
  const obj = event.data?.object as
    | { order_created?: { order_id?: string }; order_updated?: { order_id?: string }; order?: { id?: string } }
    | undefined;
  return obj?.order_created?.order_id ?? obj?.order_updated?.order_id ?? obj?.order?.id ?? event.data?.id;
}

/** Pull the (latest) fulfillment state out of an order.* webhook payload. */
function extractFulfillmentState(event: SquareWebhookEvent): string | undefined {
  const obj = event.data?.object as
    | {
        order_updated?: { state?: string };
        order?: { state?: string; fulfillments?: { state?: string }[] };
      }
    | undefined;
  const fulfillments = obj?.order?.fulfillments;
  // Prefer the fulfillment state (PROPOSED/RESERVED/PREPARED/COMPLETED); fall
  // back to the order-level state (OPEN/COMPLETED/CANCELED).
  return fulfillments?.[fulfillments.length - 1]?.state ?? obj?.order?.state ?? obj?.order_updated?.state;
}

// Square fulfillment / order states -> our customer-facing OrderStatus.
const FULFILLMENT_TO_STATUS: Record<string, OrderStatus | undefined> = {
  PROPOSED: "RECEIVED",
  RESERVED: "MAKING", // staff accepted / started
  PREPARED: "READY", // ready for pickup
  COMPLETED: "COMPLETED", // picked up
  CANCELED: "CANCELED",
  // Order-level fallbacks:
  OPEN: "MAKING",
};

const STATUS_MESSAGE: Partial<Record<OrderStatus, string>> = {
  RECEIVED: "Order received — we're on it!",
  MAKING: "We're making your order now 👨‍🍳",
  READY: "Your order is ready for pickup! 🥪",
  COMPLETED: "Thanks for picking up — see you next time!",
};

export async function verifySignature(key: string, url: string, body: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(url + body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const TTL_SECONDS = 60 * 60 * 24 * 7; // a week is plenty for de-dupe

async function alreadyProcessed(env: Env, eventId: string): Promise<boolean> {
  if (!env.IDEMPOTENCY) return store.seenEvent(eventId); // dev fallback
  return (await env.IDEMPOTENCY.get(`evt:${eventId}`)) !== null;
}

async function markProcessed(env: Env, eventId: string): Promise<void> {
  if (!env.IDEMPOTENCY) {
    store.markEvent(eventId);
    return;
  }
  await env.IDEMPOTENCY.put(`evt:${eventId}`, "1", { expirationTtl: TTL_SECONDS });
}
