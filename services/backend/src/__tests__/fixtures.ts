import type { Customer } from "@sf/contract";
import type { Env } from "../env";
import type { StoredUser } from "../store";

/**
 * Shared test helpers. Kept tiny and deterministic — no network, no clock
 * dependence beyond what the code under test already uses.
 */

/** A mock-mode Env: no Square creds, so `isLive(env)` is false. */
export function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_API_VERSION: "2026-01-22",
    SQUARE_LOCATION_ID: "",
    SQUARE_APPLICATION_ID: "sandbox-app-id",
    ...overrides,
  };
}

/** A stored user with a given Stars balance (mock-mode loyalty source). */
export function mockUser(stars = 0, customerOverrides: Partial<Customer> = {}): StoredUser {
  const customer: Customer = {
    id: "user-1",
    squareCustomerId: "mock-cust-1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "Customer",
    phone: "+16154941211",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...customerOverrides,
  };
  return { customer, stars, pushTokens: [] };
}

/** Build a POST /orders Request with a JSON body and optional idempotency key. */
export function orderRequest(body: unknown, idempotencyKey?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return new Request("https://api.test/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Compute Square's webhook signature: base64(HMAC-SHA256(key, url + body)). */
export async function squareSignature(key: string, url: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(url + body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
