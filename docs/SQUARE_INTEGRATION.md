# Square Integration — Architecture Reference (source of truth)

> Canonical spec for how this app integrates with Square POS, Orda-style.
> Every feature must stay consistent with this. The Square dashboard is the
> merchant's source of truth for menu, pricing, and reporting. For each feature
> ask: "Does Square have an API for this?" If yes, use it. If no, build on top
> of Square data.

## Scope note for THIS app (Sandwich Factory)

**Decision (2026-06-14): "single location now, architected to grow."** Build the
single-merchant, pickup-only app (one stored Square token, no OAuth UI, no
location selector). BUT keep all Square calls dynamic and location-driven (never
hardcode a location ID in business logic — resolve it from config/Locations API)
so adding locations later needs no rewrite. Multi-merchant OAuth, franchise
dashboards, and the location selector stay deferred until/unless the owner
expands.

---

## How the Square integration works

### Authentication
- Merchants connect via Square OAuth ("Sign in with Square").
- Scopes: MERCHANT_PROFILE_READ, ITEMS_READ, ORDERS_WRITE, PAYMENTS_WRITE,
  CUSTOMERS_WRITE, CUSTOMERS_READ, LOYALTY_READ, LOYALTY_WRITE,
  GIFT_CARDS_READ, GIFT_CARDS_WRITE.
- Store access_token + refresh_token per merchant/location.
- _[platform-only]_ One app can connect multiple Square accounts (franchise).
- **Single-merchant simplification (current):** one stored access token for the
  Sandwich Factory account is sufficient; OAuth is only required for the
  multi-merchant platform model.

### Menu / Catalog sync
- Pull menu from Square Catalog API — never maintain a separate item database.
- Sync: categories, items, variations (sizes), modifiers, modifier lists,
  images, pricing, tax rates.
- Respect Square item availability per location (items can differ by location).
- Category ordering follows Square ordinal unless merchant overrides.
- Item photos come from Square catalog images.
- Merchant updates in Square dashboard → app reflects on next sync / webhook.
- Custom categories/ordering may layer on top, but Square is source of truth.

### Locations
- Use Square Locations API to list locations.
- Each location: own menu availability, business hours, address.
- _[platform-only]_ Customer selects a location before browsing.
- Business hours from Square gate when ordering is available.
- Single-location merchants hide the location selector. **(That's us.)**

### Order flow
- Cart in app → submit to Square Orders API.
- Order appears in Square POS like an in-store order (KDS, receipts, reporting).
- Tag order source (e.g., "Sandwich Factory App") for dashboard filtering.
- Fulfillment: PICKUP (primary). SHIPMENT/DELIVERY _[out of scope — delivery
  stays on Uber Eats/DoorDash/Grubhub]_.
- Prep time configurable (per category or global) → sets pickup_at on the order.
- Orders can be paused (location not accepting orders).

### Payments
- Square Payments API only (never Stripe/Braintree).
- Card on File via Square Card on File API.
- Apple Pay / Google Pay via Square SDK (In-App Payments SDK on native RN).
- E-gift cards via Square Gift Cards API. _[not yet built]_
- Wallet/preload _[not yet built]_: track balance, deduct on order.
- Tips: collected in app → tip_money on the tender. _[not yet built]_

### Square Loyalty
- Use Square Loyalty API — never a separate loyalty engine. Branding: "Stars".
- Earn points per order (program defined in Square dashboard).
- Redeem as loyalty reward discounts on the Square order.
- Display balance via Loyalty API.
- After order is paid → call Loyalty accumulate.

### Customer accounts
- Create/sync via Square Customers API; link Square customer_id to app user.
- Email/phone stored in Square customer profile.
- Purchase history via Orders API filtered by customer_id.

### Catalog management rules
- Items hidden in Square are hidden in app.
- Availability windows (breakfast/lunch/dinner) via Square or a time layer.
- Modifiers: required/optional, min/max — sourced from Square modifier lists.
- Sold-out status via Square Inventory API when inventory tracking is on.

### Webhooks / real-time
- Subscribe: catalog.version.updated, order.updated, payment.completed.
- catalog.version.updated → re-sync menu.
- order.updated → push status to customer ("ready for pickup").
- Always verify webhook signatures; de-dupe on event_id.

### Multi-location / franchise _[platform-only]_
- Each Square location_id maps to one app location.
- Connect multiple Square merchant accounts to one branded app.
- Consolidate orders across accounts into one dashboard.

---

## Key Square API endpoints
- `GET /v2/locations` — list locations
- `GET /v2/catalog/list` — full catalog sync
- `POST /v2/catalog/search-catalog-objects` — search/filter catalog
- `POST /v2/orders` — create order
- `POST /v2/payments` — take payment
- `GET /v2/loyalty/programs` — loyalty program
- `POST /v2/loyalty/accounts` — create loyalty account
- `POST /v2/loyalty/events/accumulate` — add points
- `GET /v2/customers/{id}` / `POST /v2/customers` — customer profile
- `GET /v2/gift-cards` — gift card balance
- `POST /v2/inventory/counts/batch-retrieve` — stock levels

## Never do
- Never store item prices as your own source of truth — always pull from Square.
- Never build a separate payment processor — all payments via Square.
- Never build a separate loyalty engine — use Square Loyalty API.
- Never hardcode location IDs — resolve dynamically from the connected account.
- Never submit an order without a valid Square location_id.

## Environment
- Production base: `https://connect.squareup.com`
- Sandbox: `https://connect.squareupsandbox.com`
- Check the `environment` flag before every call.
- Idempotency keys on all order + payment creation calls.

---

## Current implementation status (keep honest)

| Area | Spec | Status in this repo |
|---|---|---|
| Catalog: items/variations/prices | Square Catalog | ✅ `square.ts fetchLiveMenu` |
| Catalog: photos | Square images | ✅ wired (image_ids → IMAGE url) |
| Catalog: modifiers | modifier lists | ✅ wired (min/max/single) |
| Sold-out | Inventory API | ✅ wired (`applyInventory`, fail-open) |
| Orders: create PICKUP | Orders API | ✅ wired (`createSquareOrder`) |
| Order source tag | source_name | ⬜ TODO (add `source: {name}`) |
| Prep time → pickup_at | configurable | ⬜ TODO |
| Payments | Payments API | ✅ `payments.ts` (token → CreatePayment) |
| Auth/customers | OAuth + Customers API | 🟡 single stored token; app users are local JWT, Square customer link is mocked (TODO: real Customers API) |
| Loyalty | Loyalty API | 🟡 mocked Stars; TODO accumulate/redeem via Square |
| Webhooks | verify + dedupe + react | 🟡 verify+dedupe done; TODO branch catalog/order/payment |
| Locations | Locations API | 🟡 single location via env; auto-fetch in `connect-square` |
| Gift cards / wallet / tips | Square APIs | ⬜ not built |
| Multi-location / franchise | platform | ⬜ out of scope (single location) |
| Delivery / shipment | DoorDash etc. | ⛔ out of scope by design |
