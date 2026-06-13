# STATUS — where this project is right now

_Last updated by the cloud session, 2026-06-13. Read this first if you're a
Claude Code session picking up on the owner's Mac mini._

## Who you're helping

Robert Scolaro, owner of Sandwich Factory (Murfreesboro, TN). **He is a
first-time app builder and non-technical.** Explain things in plain English,
make the technical decisions for him, and never ask him to choose between
technical options he can't be expected to understand. Only ask him for
real-world/business things (his Square account, Apple account, menu, branding).

## What's done (committed on branch `claude/new-session-u4xoyc`)

- **Phase 0** — monorepo scaffold: `contract/` (OpenAPI + shared TS types),
  `apps/mobile/` (Expo app), `services/backend/` (Cloudflare Worker). Menu pipe
  proven (app → backend → menu).
- **Phase 1 (on mock data)** — full pickup ordering loop:
  - Backend: auth (JWT + PBKDF2), orders (menu pricing, tax, Stars), payments
    (on-device token; live Square gated by `isLive()`), webhook verify+dedupe,
    loyalty/deals/favorites/devices, push module, dev-only order-status advance.
    **Verified end-to-end, 22/22 checks.**
  - App: tab nav (Menu/Deals/Account) + customize → cart → auth → checkout →
    live order status; expo-secure-store token persistence.
- Everything runs on **mock data** until Square sandbox creds are added.

## How to run it locally (do this for him)

```bash
npm install
# Terminal 1:
npm run backend:dev      # http://localhost:8787 (serves mock menu)
# Terminal 2:
npm run mobile:start     # press i for the iOS simulator (needs Xcode)
```

If Xcode isn't installed, the iOS simulator won't be available — guide him to
install it from the App Store, or use Expo Go on his iPhone (set
`EXPO_PUBLIC_API_BASE_URL` to the Mac's LAN IP).

## THE NEXT STEP he wants: connect the Square SANDBOX

He has already created a Square **sandbox** application and has:
- **Sandbox Application ID:** `sandbox-sq0idb-TDtiLZtopTCh-jcki61aMA` (not secret)
- **Sandbox Access Token:** a secret starting `EAAA...` — **he has it saved in his
  notes. Ask him to paste it into `services/backend/.dev.vars` himself (or you
  place it there locally). NEVER commit it; `.dev.vars` is gitignored.**

To connect sandbox:
1. `cp services/backend/.dev.vars.example services/backend/.dev.vars`
2. Put his Sandbox Access Token in `SQUARE_ACCESS_TOKEN=` in that file.
3. Get the Location ID automatically (don't make him hunt for it):
   ```bash
   curl -s https://connect.squareupsandbox.com/v2/locations \
     -H "Authorization: Bearer <his-token>" -H "Square-Version: 2026-01-22" | jq '.locations[].id'
   ```
   Put it in `SQUARE_LOCATION_ID` in `wrangler.toml [vars]`, and the
   Application ID above in `SQUARE_APPLICATION_ID`.
4. A fresh Square sandbox has an **empty catalog**, so `GET /menu` will be empty.
   Seed a few test items via the Catalog API (or the sandbox Seller Dashboard)
   so the real pipe shows real data. Keep the mock fallback for offline dev.
5. Restart `backend:dev` — `isLive()` flips true and the app pulls the real
   sandbox menu. Then run a test order with Square's test card
   (`cnon:card-nonce-ok` is already used by the checkout in mock; the real
   In-App Payments SDK token replaces it on an EAS dev build).

Webhooks (staff/customer push) need a public backend URL — set that up after
the local loop works (deploy the Worker, or use a tunnel like `cloudflared`),
then add the webhook subscription + `SQUARE_WEBHOOK_SIGNATURE_KEY`.

## Design preview

`/home/user/app-preview.html` (interactive) and `app-screens.html` (static
gallery) were generated in the cloud to show him the look. They are NOT part of
the app — they're throwaway visual mockups and intentionally not committed.
