import type { PutOverridesRequest } from "@sf/contract";
import type { Env } from "./env";
import { overridesStore } from "./overrides";
import { error, json } from "./responses";

/**
 * Merchant control-panel admin endpoints (foundation).
 *
 * GET  /admin/overrides — read the stored menu-overrides document.
 * PUT  /admin/overrides — replace it.
 *
 * SECURITY — TODO(admin-auth): these are guarded ONLY by the dev/sandbox gate
 * below for now. Before this ships to production it MUST get a real admin auth
 * layer (separate from customer JWTs — e.g. an admin role/token or a signed
 * session for the owner's web panel). Until then `adminAllowed` hard-blocks
 * production so the overrides surface can never be edited unauthenticated.
 */

/** Only usable in dev/sandbox until a real admin auth layer exists. */
export function adminAllowed(env: Env): boolean {
  return env.SQUARE_ENVIRONMENT !== "production";
}

export function getOverrides(env: Env): Response {
  if (!adminAllowed(env)) return error("FORBIDDEN", "Admin panel disabled in production until admin auth is built", 403);
  return json(overridesStore.get());
}

export async function putOverrides(req: Request, env: Env): Promise<Response> {
  if (!adminAllowed(env)) return error("FORBIDDEN", "Admin panel disabled in production until admin auth is built", 403);

  let body: PutOverridesRequest;
  try {
    body = (await req.json()) as PutOverridesRequest;
  } catch {
    return error("VALIDATION_FAILED", "Body must be valid JSON", 422);
  }
  if (!body || typeof body !== "object" || typeof body.items !== "object" || body.items === null) {
    return error("VALIDATION_FAILED", "Expected { items: { [itemId]: ItemOverride }, deals? }", 422);
  }
  return json(overridesStore.put(body));
}
