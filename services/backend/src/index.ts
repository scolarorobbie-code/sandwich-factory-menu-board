import type { Health } from "@sf/contract";
import { addFavorite, getLoyalty, listFavorites, registerDevice, removeFavorite } from "./account";
import { appleAuth, login, me, refresh, register, requireAuth } from "./auth";
import type { Env } from "./env";
import { getDeals, getMenu } from "./menu";
import { createOrder, getOrder, listOrders } from "./orders";
import { createPayment, devAdvanceOrder } from "./payments";
import { error, json, preflight } from "./responses";
import { handleSquareWebhook } from "./webhook";

/**
 * Sandwich Factory backend — Cloudflare Worker.
 *
 * Phase 1: full pickup ordering loop. Runs on mock data until Square sandbox
 * credentials are supplied (see README); live Square calls are gated by isLive().
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    if (method === "OPTIONS") return preflight();

    try {
      // ---------- Public ----------
      if (pathname === "/health" && method === "GET") {
        const body: Health = {
          status: "ok",
          squareEnvironment: env.SQUARE_ENVIRONMENT,
          apiVersion: env.SQUARE_API_VERSION,
          time: new Date().toISOString(),
        };
        return json(body);
      }
      if (pathname === "/menu" && method === "GET") return json(await getMenu(env));
      if (pathname === "/deals" && method === "GET") return json(getDeals());

      if (pathname === "/auth/register" && method === "POST") return await register(req, env);
      if (pathname === "/auth/login" && method === "POST") return await login(req, env);
      if (pathname === "/auth/apple" && method === "POST") return await appleAuth(req, env);
      if (pathname === "/auth/refresh" && method === "POST") return await refresh(req, env);

      // Backend-internal (Square HMAC, not our JWT)
      if (pathname === "/webhooks/square" && method === "POST") {
        return await handleSquareWebhook(req, env);
      }

      // ---------- Authenticated ----------
      const user = await requireAuth(req, env);
      if (isProtected(pathname) && !user) {
        return error("UNAUTHENTICATED", "Sign in required", 401);
      }

      if (pathname === "/me" && method === "GET") return await me(req, env);

      if (pathname === "/orders" && method === "GET") return listOrders(user!);
      if (pathname === "/orders" && method === "POST") return await createOrder(req, env, user!);

      const orderMatch = pathname.match(/^\/orders\/([^/]+)$/);
      if (orderMatch && method === "GET") return getOrder(orderMatch[1], user!);

      const advanceMatch = pathname.match(/^\/orders\/([^/]+)\/advance$/);
      if (advanceMatch && method === "POST") return await devAdvanceOrder(advanceMatch[1], env, user!);

      if (pathname === "/payments" && method === "POST") return await createPayment(req, env, user!);

      if (pathname === "/loyalty" && method === "GET") return getLoyalty(user!);

      if (pathname === "/favorites" && method === "GET") return listFavorites(user!);
      if (pathname === "/favorites" && method === "POST") return await addFavorite(req, env, user!);
      const favMatch = pathname.match(/^\/favorites\/([^/]+)$/);
      if (favMatch && method === "DELETE") return removeFavorite(favMatch[1], user!);

      if (pathname === "/devices" && method === "POST") return await registerDevice(req, env, user!);

      return error("NOT_FOUND", `No route for ${method} ${pathname}`, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return error("INTERNAL", message, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function isProtected(pathname: string): boolean {
  return (
    pathname === "/me" ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/loyalty") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/devices")
  );
}
