import type { ApiError, ErrorCode } from "@sf/contract";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export function error(code: ErrorCode, message: string, status: number, details?: unknown): Response {
  const body: ApiError = { error: { code, message, details } };
  return json(body, status);
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
