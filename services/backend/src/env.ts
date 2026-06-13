/** Bindings available to the Worker (from wrangler.toml [vars] + secrets + KV). */
export interface Env {
  // Non-secret config
  SQUARE_ENVIRONMENT: "sandbox" | "production";
  SQUARE_API_VERSION: string;
  SQUARE_LOCATION_ID: string;
  SQUARE_APPLICATION_ID: string;

  // Secrets (set via `wrangler secret put`; absent => mock mode)
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_WEBHOOK_SIGNATURE_KEY?: string;
  JWT_SIGNING_SECRET?: string;

  // KV namespace for idempotency keys + webhook event de-dupe (optional in dev)
  IDEMPOTENCY?: KVNamespace;
}

/** True when real Square credentials are present; otherwise we serve mock data. */
export function isLive(env: Env): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}
