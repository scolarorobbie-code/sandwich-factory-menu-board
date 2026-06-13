import type { Health } from "@sf/contract";
import { isLive, type Env } from "./env";
import { MOCK_MENU } from "./mocks/menu";
import { error, json, preflight } from "./responses";
import { fetchLiveMenu } from "./square";
import { handleSquareWebhook } from "./webhook";

/**
 * Sandwich Factory backend — Cloudflare Worker.
 *
 * Phase 0: health + menu (live Square Catalog when creds are present, else mock)
 * + webhook receiver (signature-verified, de-duped). Orders / payments / auth /
 * loyalty are stubbed with NOT-IMPLEMENTED and filled in Phase 1.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    if (method === "OPTIONS") return preflight();

    try {
      // --- System ---
      if (pathname === "/health" && method === "GET") {
        const body: Health = {
          status: "ok",
          squareEnvironment: env.SQUARE_ENVIRONMENT,
          apiVersion: env.SQUARE_API_VERSION,
          time: new Date().toISOString(),
        };
        return json(body);
      }

      // --- Menu (Phase 0 "prove the pipe") ---
      if (pathname === "/menu" && method === "GET") {
        if (isLive(env)) {
          const menu = await fetchLiveMenu(env);
          return json(menu);
        }
        return json(MOCK_MENU);
      }

      // --- Square webhooks (backend-internal) ---
      if (pathname === "/webhooks/square" && method === "POST") {
        return await handleSquareWebhook(req, env);
      }

      // --- Phase 1 endpoints (stubbed) ---
      if (isPhase1Route(pathname)) {
        return error("INTERNAL", "Not implemented yet (Phase 1)", 501);
      }

      return error("NOT_FOUND", `No route for ${method} ${pathname}`, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return error("INTERNAL", message, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function isPhase1Route(pathname: string): boolean {
  return (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/loyalty") ||
    pathname.startsWith("/deals") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/devices") ||
    pathname === "/me"
  );
}
