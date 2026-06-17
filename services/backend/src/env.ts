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

  // ntfy.sh backup STAFF channel (non-secret topic name). When set, new-order
  // alerts are ALSO posted to https://ntfy.sh/<NTFY_TOPIC> so the kitchen still
  // hears about orders even if the Expo push to the tablet fails. Optional.
  NTFY_TOPIC?: string;

  // Fixed STAFF / store-tablet Expo push token (non-secret). The simplest way to
  // point new-order alerts at the tablet: copy the ExponentPushToken the app
  // prints on that device into this var. Optional — the app can instead register
  // the tablet dynamically via POST /devices { staff: true }.
  STAFF_PUSH_TOKEN?: string;

  // KV namespace for idempotency keys + webhook event de-dupe (optional in dev)
  IDEMPOTENCY?: KVNamespace;
}

/** True when real Square credentials are present; otherwise we serve mock data. */
export function isLive(env: Env): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}
