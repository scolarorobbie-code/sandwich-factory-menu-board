# CLAUDE.md — Sandwich Factory Ordering App

> This file loads every session. It is the durable project memory. Keep it
> current. Ground-truth business facts live here so they are never re-derived.

## Mission

Build a **fully-owned, Square-integrated pickup ordering app** for Sandwich
Factory (single location, Murfreesboro TN), replacing the third-party Orda
white-label app. **iOS first, then Android from the same React Native + Expo
codebase.**

## Ground truth (do NOT re-derive)

- **One location:** 116 Chaffin Pl, Murfreesboro, TN. Phone (615) 494-1211.
- **Web:** sandwichfactorytn.com
- **POS:** Square. Already wired to a kitchen printer. **Do NOT build printing.**
  Orders created via the Square Orders API flow into the existing POS and print
  on the current setup.
- **Fulfillment in THIS app = pickup only.** No delivery, no driver tracking,
  no address logic. Delivery stays on Uber Eats / DoorDash / Grubhub — out of
  scope.
- **~2,000 existing customers** live in Orda. Loyalty migration is a *separate*
  task (Phase 4). Build for new sign-ups now; design loyalty so existing
  customers can be seeded later.
- **App Store listing already exists** ("Sandwich Factory Online") under the
  owner's Apple Developer account (Scolaro Enterprises Inc). Ship as an
  **update to that listing** — preserve users and ratings, not a new listing.

## Hard rules (non-negotiable)

1. **Secrets never live in the app.** Square access token and all API keys live
   ONLY on the backend, in env vars. The app talks to OUR backend, never
   directly to Square for privileged ops. Assume the shipped binary is cracked.
2. **Card data:** use Square's **In-App Payments SDK** so the card is tokenized
   on-device. App and backend never see raw card numbers. Never build a custom
   card form.
3. **Verify every Square webhook signature** before trusting it. Reject anything
   that fails HMAC-SHA256 verification.
4. **Idempotency:** de-dupe webhooks on `event_id`; one order never
   prints/notifies twice. Use Square `Idempotency-Key` on all create calls.
5. **One codebase, two platforms.** React Native + Expo. Platform-specific code
   only where unavoidable. No second from-scratch Android project.
6. **Square API version:** target `2026-01-22` or later.

## Architecture (three components)

1. **Mobile app** — React Native + Expo (TypeScript). Menu, customization,
   cart, sign-in, payment (Square In-App Payments SDK), order status, history,
   favorites, loyalty, deals. Talks only to OUR backend.
2. **Backend** — Cloudflare Workers + TypeScript (default). Holds Square creds;
   creates orders; verifies + de-dupes webhooks; sends push; serves menu
   (proxied from Square Catalog) and loyalty/deals data.
3. **Notifications** — (a) staff alert to a dedicated store tablet the instant an
   order is placed; (b) customer push for order status. Expo Push (APNs/FCM).
   ntfy.sh allowed as a backup staff channel.

### Core order flow

```
App "Place Order" → backend → Square Orders API (creates order)
   → backend CreatePayment with on-device card token
Square fires order.created webhook → backend (verify signature, de-dupe)
   → push to staff tablet ("New order #1043")
   → order prints via existing Square POS
order.updated / fulfillment-state change → push to customer ("Ready for pickup")
```

## ⚠️ Key technical constraint — Expo + In-App Payments SDK

The Square In-App Payments React Native plugin wraps **native** iOS/Android
modules. It does **NOT** run in **Expo Go** or the managed workflow without
native code. Resolution we are committing to:

- Use Expo with a **config plugin** for the Square SDK + **EAS Build**
  (development + production builds).
- **Payments are only testable on an EAS dev build**, never in Expo Go. The
  rest of the app (menu, cart, auth UI) can iterate in Expo Go against mocks.

## API contract is the source of truth

`/contract` defines every endpoint between app and backend (`openapi.yaml` +
typed `types.ts`). **Both workstreams build against the contract.** Treat changes
to it as deliberate, reviewed events — do not let any stream silently change it.

## Tech stack

- **Mobile:** React Native + Expo (EAS Build), TypeScript.
- **Backend:** Cloudflare Workers + TypeScript (default; Firebase Functions
  acceptable only if it materially simplifies push).
- **Payments:** Square In-App Payments SDK (RN plugin via Expo config plugin).
- **Menu:** Square Catalog API (single source of truth — never hardcode menu).
- **Orders:** Square Orders API → Square POS fulfillment.
- **Loyalty:** Square Loyalty API. Branding: keep "Stars".
- **Push:** Expo Notifications (APNs/FCM); ntfy.sh backup staff channel.
- **Auth:** email + password **and** Apple Sign-In (default; confirm vs. Orda
  login screen). Backend issues JWT access + refresh tokens.

## Build phases

- **Phase 0 — Foundations:** Square sandbox creds. Scaffold Expo app + Worker
  backend. Write API contract. **Prove the pipe:** pull the REAL menu from Square
  Catalog and render one category in the app. Nothing else until this works.
- **Phase 1 — MVP core loop (sandbox):** browse + customize → cart → sign in →
  pay (sandbox) → order in Square → `order.created` webhook → staff push →
  status push to customer. Real test orders. Ship to TestFlight.
- **Phase 2 — Real app (required before submission, guards vs. Apple 4.3):**
  accounts + order history, saved favorites / one-tap reorder, app-exclusive
  deals screen, transparent loyalty math, real-time order status, push.
- **Phase 3 — Android:** same codebase, fix UI quirks, wire FCM, Google Play.
- **Phase 4 — Migration off Orda (separate):** export Stars balances, seed Square
  Loyalty, grandfather existing customers with a bonus.

## Definition of done — Phase 1

A test customer can, in iOS against Square **sandbox**: browse the real menu,
customize + add an item, sign in, pay, have the order appear in Square POS AND
trigger an instant staff-tablet push — then receive a "ready for pickup" push
when staff mark it ready. No secrets in the bundle. Webhook signatures verified.
Duplicate webhooks ignored.

## Secrets / env (backend only — NEVER commit, NEVER ship in app)

- `SQUARE_ACCESS_TOKEN` (sandbox first)
- `SQUARE_LOCATION_ID`
- `SQUARE_APPLICATION_ID` (the app needs the *sandbox application ID* — public,
  not a secret — for the In-App Payments SDK init)
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_ENVIRONMENT` = `sandbox` | `production`
- `JWT_SIGNING_SECRET`, `APPLE_*` (Sign-In with Apple), `EXPO_ACCESS_TOKEN`

## Model discipline

Plan with Opus 4.8; build the bulk with Sonnet 4.6; mechanical edits with
Haiku 4.5; Fable 5 only when Opus stalls on a hard knot.

## Repo note

The existing `tv-*.html` files are the in-store **digital menu boards** (Roku/TV
displays) and are unrelated to the ordering app. Leave them in place. App code
will live under `apps/` and `services/` (see plan).
