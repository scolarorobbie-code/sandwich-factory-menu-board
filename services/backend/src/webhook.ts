import type { Env } from "./env";
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

  const event = JSON.parse(rawBody) as { event_id?: string; type?: string };
  if (!event.event_id) {
    return error("VALIDATION_FAILED", "Missing event_id", 422);
  }

  // Idempotency: process each event_id at most once.
  if (await alreadyProcessed(env, event.event_id)) {
    return json({ status: "duplicate-ignored" });
  }
  await markProcessed(env, event.event_id);

  // TODO (Phase 1): branch on event.type:
  //   order.created  -> push to staff tablet
  //   order.updated  -> push order status to customer when fulfillment -> READY
  //   order.fulfillment.updated -> same
  return json({ status: "accepted", type: event.type });
}

async function verifySignature(key: string, url: string, body: string, signature: string): Promise<boolean> {
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
