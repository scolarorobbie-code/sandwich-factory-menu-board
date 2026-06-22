# API Contract — Sandwich Factory Ordering App

This directory is the **single source of truth** for every endpoint between the
mobile app and the backend. Both workstreams (App/UI and Backend/Square) build
against this contract. **Changing it is a deliberate, reviewed event** — never
let one stream silently diverge.

## Files

- **`openapi.yaml`** — OpenAPI 3.1 spec. Human-readable + machine-checkable.
  Use it to generate mock servers (e.g. Prism) and client/server type stubs.
- **`types.ts`** — Hand-authored TypeScript types + enums shared by the Expo app
  and the Worker backend. This is the version the code imports directly so the
  two sides cannot drift. Keep it in sync with `openapi.yaml`.

## Conventions

- **Base URL:** the app reads it from config (`EXPO_PUBLIC_API_BASE_URL`).
  Sandbox and production are different backend deployments.
- **Auth:** `Authorization: Bearer <accessToken>` on all non-public endpoints.
  Access tokens are short-lived JWTs; refresh via `POST /auth/refresh`.
- **Money:** always `{ amount: <integer minor units>, currency: "USD" }` — mirrors
  Square. `amount` is **cents**. Never use floats for money.
- **IDs:** strings. Square object IDs are passed through opaquely; never parse them.
- **Timestamps:** RFC 3339 / ISO 8601 UTC strings.
- **Errors:** every non-2xx returns the `Error` schema:
  `{ error: { code, message, details? } }` with an appropriate HTTP status.
- **Idempotency:** `POST /orders` and `POST /payments` accept an
  `Idempotency-Key` header (client-generated UUID). The backend forwards a key to
  Square so retries never double-charge or double-create.
- **Pagination:** list endpoints take `?cursor=` and return `{ items, cursor? }`.

## Public vs. authenticated

- **Public (no token):** `GET /health`, `GET /menu`, `GET /deals`,
  `POST /auth/*`.
- **Authenticated:** everything under `/me`, `/orders`, `/favorites`,
  `/loyalty`, `/devices`.
- **Backend-internal (not called by the app):** `POST /webhooks/square`
  (verified by Square HMAC signature, not by our JWT).

## What is intentionally NOT here

- No delivery / address endpoints — pickup only.
- No printing — Square POS owns fulfillment hardware.
- No raw card fields anywhere — cards are tokenized on-device by the Square
  In-App Payments SDK; the app sends only an opaque `sourceId` (payment token).
