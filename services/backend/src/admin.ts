import type { PutOverridesRequest } from "@sf/contract";
import { signJwt, timingSafeEqual, verifyJwt } from "./auth";
import type { Env } from "./env";
import { overridesStore } from "./overrides";
import { error, json } from "./responses";

/**
 * Merchant control-panel admin endpoints.
 *
 * POST /admin/login     — exchange the admin password for a short-lived admin JWT.
 * GET  /admin/overrides — read the stored menu-overrides document.
 * PUT  /admin/overrides — replace it.
 *
 * AUTH model (intentionally minimal — one non-technical owner, one password):
 *   - If `ADMIN_PASSWORD` is set, `/admin/overrides` requires a valid admin JWT
 *     (Authorization: Bearer ...) minted by POST /admin/login. The token is
 *     signed with the SAME JWT helpers + secret as customer auth (no duplicated
 *     crypto) but carries `typ: "admin"`, so a customer access token can never
 *     satisfy an admin route and vice-versa.
 *   - If `ADMIN_PASSWORD` is unset, we fall back to the original dev/sandbox
 *     open gate so local development keeps working with no password. In
 *     production with no password set, the panel stays disabled (403).
 */

const ADMIN_TTL = 60 * 60 * 8; // 8 hours — long enough for an editing session

function jwtSecret(env: Env): string {
  return env.JWT_SIGNING_SECRET ?? "dev-only-change-me";
}

/**
 * Decide whether the current request may touch the overrides surface.
 *
 * Returns `true` when authorized, or an error `Response` when not (so the caller
 * can just `return` it).
 */
async function authorizeAdmin(req: Request, env: Env): Promise<true | Response> {
  const password = env.ADMIN_PASSWORD;

  // No password configured: keep the legacy dev/sandbox open gate.
  if (!password) {
    if (env.SQUARE_ENVIRONMENT !== "production") return true;
    return error(
      "FORBIDDEN",
      "Admin panel disabled: set the ADMIN_PASSWORD secret to enable it in production",
      403,
    );
  }

  // Password configured: require a valid admin Bearer token.
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return error("UNAUTHENTICATED", "Admin sign-in required", 401);
  }
  const claims = await verifyJwt(jwtSecret(env), header.slice(7), "admin");
  if (!claims) return error("UNAUTHENTICATED", "Admin session invalid or expired", 401);
  return true;
}

/** POST /admin/login — { password } → { token, expiresIn }. */
export async function adminLogin(req: Request, env: Env): Promise<Response> {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return error("VALIDATION_FAILED", "Body must be valid JSON { password }", 422);
  }
  const supplied = body?.password ?? "";

  // No password configured: only hand out a token in dev/sandbox (matches the
  // open-gate fallback) so the panel can still be used locally.
  if (!env.ADMIN_PASSWORD) {
    if (env.SQUARE_ENVIRONMENT === "production") {
      return error("FORBIDDEN", "Admin panel disabled: ADMIN_PASSWORD is not set", 403);
    }
  } else if (!timingSafeEqual(supplied, env.ADMIN_PASSWORD)) {
    return error("UNAUTHENTICATED", "Incorrect admin password", 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(jwtSecret(env), { sub: "admin", typ: "admin", exp: now + ADMIN_TTL });
  return json({ token, expiresIn: ADMIN_TTL });
}

export async function getOverrides(req: Request, env: Env): Promise<Response> {
  const ok = await authorizeAdmin(req, env);
  if (ok !== true) return ok;
  return json(await overridesStore.get(env));
}

export async function putOverrides(req: Request, env: Env): Promise<Response> {
  const ok = await authorizeAdmin(req, env);
  if (ok !== true) return ok;

  let body: PutOverridesRequest;
  try {
    body = (await req.json()) as PutOverridesRequest;
  } catch {
    return error("VALIDATION_FAILED", "Body must be valid JSON", 422);
  }
  if (!body || typeof body !== "object" || typeof body.items !== "object" || body.items === null) {
    return error("VALIDATION_FAILED", "Expected { items: { [itemId]: ItemOverride }, deals? }", 422);
  }
  return json(await overridesStore.put(env, body));
}
