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

  // Merchant control-panel password (secret). Set via
  // `wrangler secret put ADMIN_PASSWORD`. When unset, admin endpoints fall back
  // to the dev/sandbox open gate so local dev still works without a password.
  // In production it MUST be set, or the admin panel stays disabled.
  ADMIN_PASSWORD?: string;

  // KV namespace for idempotency keys + webhook event de-dupe (optional in dev)
  IDEMPOTENCY?: KVNamespace;

  // KV namespace for merchant control-panel menu overrides (optional in dev).
  // When bound, overrides persist across Worker restarts/redeploys; when absent
  // (zero-config local/test), overrides.ts falls back to an in-memory document.
  // Same convention as IDEMPOTENCY above. `wrangler dev` supplies a simulated KV
  // automatically, so local edits also persist without any setup.
  OVERRIDES?: KVNamespace;
}

/** True when real Square credentials are present; otherwise we serve mock data. */
export function isLive(env: Env): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}
