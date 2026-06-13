# Sandwich Factory

Two things live in this repo:

1. **The ordering app** (this is the active project) — a fully-owned,
   Square-integrated **pickup ordering app** for iOS first, then Android, from
   one React Native + Expo codebase. Replaces the third-party Orda app.
2. **The in-store digital menu boards** — the `tv-*.html` files that drive the
   TV displays in the shop. Unrelated to the app; left in place.

See **`CLAUDE.md`** for the full plan, business ground-truth, and hard rules.

## Project layout

```
contract/          API source of truth (OpenAPI + shared TS types) — read first
apps/mobile/       Expo app (React Native, TypeScript)
services/backend/  Cloudflare Worker (holds Square creds; menu/orders/webhooks)
tv-*.html          In-store menu-board displays (separate concern)
```

## Quick start (Phase 0 — safe mock data, no Square account needed)

```bash
npm install                  # installs all workspaces

# Terminal 1 — backend on http://localhost:8787 (serves the mock menu)
npm run backend:dev

# Terminal 2 — the app (press i for the iOS simulator)
npm run mobile:start
```

The app loads a menu category from the backend. No real money, nothing connected
to the live Square account yet — that's a later, guided step (see
`services/backend/README.md`).

## Status

- ✅ **Phase 0 foundations** — contract, Expo app, Worker backend, menu pipe,
  webhook signature verification.
- ✅ **Phase 1 core loop (on mock data)** — customize → cart → sign in → pay →
  order created → staff alert + customer status. Backend loop verified
  end-to-end (22/22 checks). App screens built (menu, item customization, cart,
  auth, checkout, live order status, deals, account + Stars + history).
- ⏭️ **Next** — connect Square sandbox (real menu, real test card, real
  webhooks), then build an EAS dev build to test the native In-App Payments SDK
  and push notifications on a device. See `services/backend/README.md`.

## Hard rules (full list in `CLAUDE.md`)

Secrets live only on the backend · cards tokenized on-device (Square In-App
Payments SDK) · every webhook signature verified · webhooks de-duped · one
Expo codebase for both platforms · Square API version `2026-01-22`+.
