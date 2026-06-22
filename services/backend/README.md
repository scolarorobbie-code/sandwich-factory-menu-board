# Backend — Cloudflare Worker

Holds Square credentials. Serves the menu, creates orders/payments (Phase 1),
and receives Square webhooks. The mobile app talks ONLY to this Worker, never
to Square directly.

## Run locally (mock data — no Square needed)

```bash
npm install                 # from repo root (workspaces)
cp services/backend/.dev.vars.example services/backend/.dev.vars
npm run backend:dev         # wrangler dev
```

Then:

- `GET http://localhost:8787/health` → environment info
- `GET http://localhost:8787/menu`   → the mock menu (real menu once Square is connected)

With no `SQUARE_ACCESS_TOKEN` set, the Worker serves the **mock menu**
(`src/mocks/menu.ts`). Set the token and a location id and it serves the **real
Square Catalog** instead — no code change.

## Connecting Square sandbox (later, when you're ready)

1. Sign in at <https://developer.squareup.com> with the Sandwich Factory Square
   login and create an application.
2. Open the app's **Sandbox** tab. Copy:
   - **Sandbox Access Token** → `wrangler secret put SQUARE_ACCESS_TOKEN`
   - **Sandbox Application ID** → `SQUARE_APPLICATION_ID` in `wrangler.toml [vars]`
   - **Location ID** (Locations page) → `SQUARE_LOCATION_ID` in `wrangler.toml`
3. Webhooks page → add subscription pointing at `/webhooks/square`, copy the
   **Signature Key** → `wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY`.
4. Create the KV namespace for de-dupe and uncomment the binding in
   `wrangler.toml`:
   ```bash
   wrangler kv namespace create IDEMPOTENCY
   ```

Secrets are never committed (see `.gitignore` + hard rule #1).

## Layout

| File | Purpose |
|---|---|
| `src/index.ts` | Router: health, menu, webhooks, Phase-1 stubs |
| `src/square.ts` | Square Connect client + Catalog→Menu mapping |
| `src/webhook.ts` | HMAC signature verification + event de-dupe |
| `src/mocks/menu.ts` | Contract-shaped mock menu |
| `src/env.ts` | Worker bindings + live/mock detection |
| `src/responses.ts` | JSON + error helpers (+ CORS) |
