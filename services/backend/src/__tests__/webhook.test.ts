import { beforeEach, describe, expect, it } from "vitest";
import { handleSquareWebhook, verifySignature } from "../webhook";
import { store } from "../store";
import { mockEnv, squareSignature } from "./fixtures";

const KEY = "test-webhook-signing-key";
const URL = "https://api.test/webhooks/square";

function webhookRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) headers["x-square-hmacsha256-signature"] = signature;
  return new Request(URL, { method: "POST", headers, body });
}

describe("verifySignature (HMAC-SHA256 over url + body)", () => {
  it("accepts a correctly-signed body", async () => {
    const body = JSON.stringify({ event_id: "evt-1", type: "order.created" });
    const sig = await squareSignature(KEY, URL, body);
    expect(await verifySignature(KEY, URL, body, sig)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const body = JSON.stringify({ event_id: "evt-1", type: "order.created" });
    const sig = await squareSignature(KEY, URL, body);
    const tampered = JSON.stringify({ event_id: "evt-1", type: "order.canceled" });
    expect(await verifySignature(KEY, URL, tampered, sig)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const body = JSON.stringify({ event_id: "evt-1", type: "order.created" });
    const sig = await squareSignature(KEY, URL, body);
    const badSig = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA");
    expect(await verifySignature(KEY, URL, body, badSig)).toBe(false);
  });

  it("rejects when signed with the wrong key", async () => {
    const body = JSON.stringify({ event_id: "evt-1" });
    const sig = await squareSignature("some-other-key", URL, body);
    expect(await verifySignature(KEY, URL, body, sig)).toBe(false);
  });
});

describe("handleSquareWebhook", () => {
  beforeEach(() => {
    // Clean the in-memory de-dupe set between tests (no KV binding => fallback).
    store.reset();
  });

  it("503s when no signing key is configured", async () => {
    const body = JSON.stringify({ event_id: "evt-x" });
    const res = await handleSquareWebhook(webhookRequest(body, "anything"), mockEnv());
    expect(res.status).toBe(503);
  });

  it("401s on a missing signature", async () => {
    const env = mockEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY: KEY });
    const body = JSON.stringify({ event_id: "evt-x" });
    const res = await handleSquareWebhook(webhookRequest(body, null), env);
    expect(res.status).toBe(401);
  });

  it("401s on an invalid signature", async () => {
    const env = mockEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY: KEY });
    const body = JSON.stringify({ event_id: "evt-x" });
    const res = await handleSquareWebhook(webhookRequest(body, "not-a-valid-sig"), env);
    expect(res.status).toBe(401);
  });

  it("422s when event_id is missing", async () => {
    const env = mockEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY: KEY });
    const body = JSON.stringify({ type: "order.created" });
    const sig = await squareSignature(KEY, URL, body);
    const res = await handleSquareWebhook(webhookRequest(body, sig), env);
    expect(res.status).toBe(422);
  });

  it("accepts a valid event, then ignores a duplicate event_id", async () => {
    const env = mockEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY: KEY });
    const body = JSON.stringify({ event_id: "evt-dedupe", type: "order.created" });
    const sig = await squareSignature(KEY, URL, body);

    const first = await handleSquareWebhook(webhookRequest(body, sig), env);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "accepted", type: "order.created" });

    // Same event_id again -> de-duped (Hard rule #4: process at most once).
    const second = await handleSquareWebhook(webhookRequest(body, sig), env);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "duplicate-ignored" });
  });
});
