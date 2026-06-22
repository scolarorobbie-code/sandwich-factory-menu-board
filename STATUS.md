# STATUS — where this project is right now

_For a Claude session picking up work. Read this + CLAUDE.md +
docs/SQUARE_INTEGRATION.md first. Commands for the owner are in COMMANDS.md._

## Who you're helping
Robert Scolaro, owner of Sandwich Factory (Murfreesboro, TN). **First-time, non-
technical app builder.** Explain in plain English, make the technical calls for
him, never ask him to choose between options he can't be expected to understand.
He runs commands on his Mac (Claude Code there); this branch is the source of truth.

## Branch
All work is on `claude/new-session-u4xoyc` (PR #1 open against `main`).

## Working today (verified)
- **Real menu live from Square.** `connect-square` + `mirror-catalog` copied his
  real production menu (129 items, 70 categories, 103 modifier lists) into the
  Square **sandbox**; the app shows it. Backend `isLive()` pulls the live catalog.
- **Menu screen:** sticky category jump-bar + bigger photo cards.
- **Photos:** real Square photos when present, else on-theme AI/stock placeholders
  (loremflickr by item-name keyword).
- **Customization:** collapsible groups; modifier groups ordered by the leading
  number in their Square name and that number is stripped for display.
- **Combo → drink:** conditional modifier — a group named "...Drink" only appears
  once a combo option is picked (app heuristic in ItemDetailScreen). Owner added a
  "Choose Your Drink" set in the sandbox via a one-off script.
- **Full ordering loop** (auth, cart, order, payment, status, loyalty/deals/
  favorites, webhook verify+dedupe) works on mock + sandbox; backend tested.
- **Square catalog pagination FIXED** — `fetchLiveMenu` now follows the cursor.
  Before, anything past page 1 (200+ objects) was silently dropped, which hid
  combo drink lists. This was the real cause of the "drink picker missing" bug.
- **`add-drink-set` script** (`npm run add-drink-set`) — attaches a "Choose Your
  Drink" modifier list to EVERY combo item in the sandbox. Idempotent, committed.

## Landed in the parallel-agent build pass (2026-06-14, all merged + typechecks green)
- **Real Square Loyalty (Stars)** — backend `loyalty.ts`: earn on payment +
  redeem rewards via the Loyalty API, Square as source of truth. Fails soft if no
  loyalty program exists. Mock keeps local 50-Stars=$5 so it still demos.
- **Mobile loyalty UI** — phone field at sign-up (optional, for Stars mapping) +
  "Use N Stars · save $X" redeem control at checkout that recomputes the total.
- **Merchant control panel — backend + dashboard** — override layer (`overrides.ts`,
  applied in `menu.ts`): per-group required/min/max + conditional rules, per-item
  hidden/sold-out + prep time. Admin auth (`POST /admin/login`, `ADMIN_PASSWORD`
  secret, 8h admin JWT). **Web dashboard served at `GET /admin`** (`public/admin.html`).
- **One-tap reorder** — order-history rows re-add their items to the cart (resolves
  historical names against the live menu; skips items that no longer exist).
- **Saved favorites** — heart on ItemDetail saves a build; Favorites section in
  Account with one-tap add. Uses existing favorites endpoints.
- **Premium polish** — skeleton loaders (replace bare spinners) + haptics
  (`expo-haptics`, lazy + crash-proof). ⚠️ Owner must `npm install` for haptics.
- **Strategy docs (read these):** `docs/COMPETITIVE_ANALYSIS.md` (franchise-app
  teardown + prioritized punch-list) and `docs/WEB_SOCIAL_AUDIT.md` (website +
  social audit — note: the current website's ordering is Orda-built and dies when
  he leaves Orda; the app becomes the ordering path).
- **Control panel design + remaining work:** `docs/CONTROL_PANEL.md`.

## Landed in the SECOND parallel-agent pass (2026-06-17, all merged, green, pushed)
- **Test suite + CI** — Vitest, **56 passing backend tests** (`npm test` / `cd
  services/backend && npm run test`) covering webhook HMAC verify + event dedupe,
  order pricing + tax + Stars redemption math, loyalty tier selection, overrides
  apply, and Square modifier-group mapping. **GitHub Actions CI** (`.github/
  workflows/ci.yml`) typechecks backend + mobile and runs tests on every push/PR.
- **Control panel now PERSISTS** — overrides moved to Cloudflare KV (`OVERRIDES`
  binding) with in-memory fallback for local dev/tests. No more reset-on-restart.
  Owner creates the namespace before deploy: `cd services/backend && npx wrangler
  kv namespace create OVERRIDES` (also documented for `IDEMPOTENCY`).
- **Prep time → Square `pickup_at`** — orders now carry a scheduled pickup time =
  now + max(prep minutes across items, floor 10), instead of always ASAP.
- **Push notifications wired end-to-end** — mobile registers an Expo push token on
  sign-in (crash-proof, no-ops in Expo Go/sim); backend sends real Expo pushes from
  the VERIFIED webhook path: `order.created` → staff tablet, `order.updated`/
  `order.fulfillment.updated` → customer "ready for pickup". Staff tablet set via
  long-press Account greeting OR `STAFF_PUSH_TOKEN` env; `NTFY_TOPIC` backup channel.
  ⚠️ Owner must `npm install` (new `expo-notifications` dep). ⚠️ REAL push delivery
  needs an EAS dev build on a PHYSICAL device — cannot be verified in Expo Go/sim.

## Landed in the deals-in-panel pass (2026-06-17, green)
- **App-exclusive deals now managed from the control panel** — the last open
  control-panel item. `DealOverride` became a full, additive deal definition
  (title/description/code/dates/enabled/appExclusive + a `DealDiscount` spec:
  `freeItem` / `amountOff` / `doubleStars`). Deals live in the same KV-backed
  overrides document items use; `getDeals(env)` (now async) reads + maps them to
  the unchanged app-facing `Deal` contract, seeding the two shipped deals when the
  store is empty so nothing disappears. Checkout (`orders.ts`) applies the discount
  from the override spec (`dealDiscountCents`) instead of a hardcoded id check —
  behavior equivalent; Square still computes LIVE totals. `admin.html` gained a
  Deals section (list/add/edit/remove/toggle/dates/discount). 15 new backend
  tests (71 total, all green). Square stays the price source of truth — deals are
  an app promo layer. See `docs/CONTROL_PANEL.md`.

## Landed in the THIRD pass (2026-06-17, all merged, green, pushed)
- **Combo rules are DATA now, not a regex guess** — `ModifierGroup.conditional`
  is a contract field set from the control panel; the app prefers it and the old
  `/drink/`+`/combo/` regex is only a fallback for unconfigured items. The combo
  saga is properly closed.
- **Branding scaffold** — ALL colors + the logo live in one file
  (`apps/mobile/src/brand.ts`); `theme.ts` derives from it (app looks identical
  today). `Brandmark` header component auto-swaps text→logo image when assets
  arrive. `docs/BRANDING.md` is the owner's drop-in checklist. So branding is now
  a quick swap once he sends assets — not a rebuild.
- **Backend tests expanded to 108** (was 56) — added auth (JWT/PBKDF2/validation),
  payments (charge/decline/status/ownership), and account/favorites/history.
- **Mobile UX polish** — **menu search** (filters 129 items live), pull-to-refresh,
  **order ETA** ("Ready in ~N min", from `pickup.readyEta`) + upgraded status
  timeline, unified friendly empty/error states, and an **accessibility pass**
  (labels/roles/hints, ≥44pt targets) for App-Store quality.

## Landed in the FOURTH pass (2026-06-17, all merged, green, pushed)
- **Square In-App Payments SCAFFOLDED** (the CLAUDE.md key constraint) — card
  tokenization now goes through `apps/mobile/src/payments/squarePayments.ts`, a
  crash-proof abstraction (lazy-require, like haptics/push). Expo Go is UNCHANGED
  (still the sandbox test nonce); a real EAS build presents Square's native card
  form. The native dep is deliberately NOT in package.json (so `npm install` can't
  break) — it's installed during the EAS build, per **`docs/EAS_AND_PAYMENTS.md`**
  (the runbook). Added `eas.json` (dev/preview/production) + public app id in
  `app.json` extra. Backend already accepted the verification token — no change.
- **"Your usual" on the Menu home** — signed-in users see favorites (quick add) +
  a one-tap "reorder last order" row at the top of the Menu (hidden during search,
  renders nothing for new/signed-out users). Reuses the existing reorder helper.

## Branding + Android + double-check pass (2026-06-17, all merged, green, pushed)
- **BRANDING APPLIED** — real logo colors (cream/brick-red/golden) in `brand.ts`;
  a faithful in-brand badge recreation wired as app icon / splash / Android
  adaptive icon / header logo (`apps/mobile/assets/`). Swap the 5 PNGs for the
  owner's exact exports anytime — no code change (`docs/BRANDING.md`).
- **ANDROID-READY** — notification channel, EAS Android profiles, minimal
  permissions, `expo-build-properties` (minSdk 24 / iOS 16.4). FCM setup runbook
  in `docs/EAS_AND_PAYMENTS.md`. Same single codebase as iOS.
- **More features** — apply-a-deal at checkout, a Settings screen (notification
  status + edit profile/phone via `PATCH /me`), receipt links on order status.
- **Tests now 132** (113 backend + 19 mobile) + CI runs both suites.
- **Three-reviewer double-check (correctness / security / integration):** all 6
  hard security rules PASS. Fixed every real finding: JWT now fails closed in
  prod + pins HS256; admin panel gets CSP/anti-clickjacking headers; LIVE deals
  now apply as a real Square ad-hoc discount; `pickup.readyEta` is populated (the
  ETA card works); Apple Sign-In wired client+state (UI button lands on the EAS
  build); `store.reset()` leak, refresh-token rotation persistence, and a
  `$Infinity` price-guard fixed; payment declines no longer leak Square's raw
  detail; OpenAPI admin/advance routes + descriptions corrected. Also caught +
  fixed two build-breakers: missing `expo-build-properties` install and an iOS
  deployment target below Expo SDK 56's floor.

## Landed in the polish pass (2026-06-22, green, pushed — commits 6766f28, a453c05, 4960db5)
- **Real tab bar icons** — replaced emoji (🥪🔥⭐) with Ionicons `restaurant` /
  `pricetag` / `person-circle` (filled when active, outline when inactive). Installs
  `@expo/vector-icons ^15.1.1`.
- **Deals are now actionable** — "Apply at checkout →" button on every deal card in the
  Deals tab. Navigates directly to Checkout with that deal pre-applied (shows an Alert
  if the cart is empty). CheckoutScreen also accepts a `dealId` route param so the
  Deals tab and deep-links can pre-select a deal.
- **Stars earn preview in Cart** — signed-in users see "⭐ You'll earn ~X Stars" in the
  cart footer on every order build.
- **Loyalty progress bar** — AccountScreen Stars card now shows a filled progress bar
  toward the next reward tier; copy switches to "🎉 You can redeem!" when the balance
  reaches the threshold.
- **Dev-only simulate button** — "Simulate staff updating the order" is now wrapped in
  `__DEV__` so it is invisible in the production EAS build but still works in Expo Go
  / dev builds where you need it.
- **Checkout shows full customization** — variation name + modifier list + kitchen note
  appear under each line item in the checkout summary (e.g. "6 inch · Herb & Cheese ·
  Extra bacon") so customers can verify their exact build before paying.
- **Account pull-to-refresh** — pull down to reload loyalty, order history, favorites,
  and the menu catalog.
- **Settings icon** — replaced the ⚙︎ text character in AccountScreen with Ionicons
  `settings-outline`.
- **Apple Sign-In button** (`apps/mobile/src/auth/appleAuth.ts`) — same lazy-require
  pattern as Square payments. `isAppleAuthAvailable()` checks at runtime whether
  `expo-apple-authentication` is installed AND the device supports it. AuthScreen shows
  a black "Sign in with Apple" button with an or-divider when available; renders nothing
  in Expo Go / Android / when the module is missing (no placeholder text clutter). The
  module stays out of package.json until the EAS build session.

## Decisions (owner-confirmed)
- Photos: real Square + AI fallback. Brand: **match website** (awaiting his logo +
  colors — site is bot-blocked, he must send the image). Customization: collapsible.
  Loyalty: **use his Square Loyalty program**. Focus: premium look.
- **Modifier limits (required/min/max) and conditional rules are NOT in Square** —
  they live in Orda's panel today. Decision: set basics in Square for now; **BUILD
  a merchant control panel later** (Orda-style admin: required/min/max, conditional
  modifiers, hide items, prep time, deals). Tracked in CLAUDE.md.

## Next steps (in priority order)
1. **`npm install` on his Mac** — REQUIRED (new deps added: `expo-haptics`,
   `expo-notifications`, `expo-build-properties`, `@expo/vector-icons`). Run once,
   then `npm run add-drink-set`, restart backend, ⌘R, confirm combo → drink appears.
2. **Run a real end-to-end test order** — the full flow is built and ready.
   See the test protocol below.
3. **Branding** — scaffold is READY (one file: `apps/mobile/src/brand.ts` +
   `docs/BRANDING.md`). Still need the OWNER to send: logo (PNG/vector) + brand
   hex colors + storefront/food photos. Once he does it's a quick drop-in, not a
   rebuild. This is the #1 thing only he can unblock.
4. **EAS dev build** — the gate for testing what Expo Go can't: real Square
   In-App Payments, real push delivery, AND Apple Sign-In. Needs his Expo + Apple
   accounts. **Runbook is ready: `docs/EAS_AND_PAYMENTS.md`**. Production path:
   `npx testflight`. Apple Sign-In button shows automatically on the EAS build
   (lazy-require — it's absent in Expo Go, no placeholder clutter).
5. **Control panel — DONE.** See `docs/CONTROL_PANEL.md`.
6. **Loyalty — to actually test Stars:** sandbox needs an ACTIVE loyalty program
   configured; loyalty maps by phone (now captured at sign-up).
7. **Competitive punch-list** — all punch-list items from `docs/COMPETITIVE_ANALYSIS.md`
   are now done or owner-blocked (real food photos = owner must shoot/upload to Square).
   Remaining from the premium look & feel checklist: add-to-cart animation + animated
   cart badge (motion polish). Everything else is shipped.

## Test order protocol (Phase 1 verification)
Do this to prove the real square loop works:

**Before you start:** backend must be running (`npm run backend:dev` → wait for
`Ready on http://localhost:8787`). App must be open in simulator.

1. In the app: tap a combo sandwich (e.g. "Mile High Corned Beef").
2. Pick a size/variation. Choose a combo modifier if one is shown. The "Choose
   Your Drink" group should auto-appear — pick a drink.
3. Tap "Add 1 · $X.XX". You'll land in the cart.
4. Tap "Go to checkout". If not signed in, create an account (any email/password).
5. Checkout screen shows the order total (tax computed by Square, not us).
6. Tap the gold "Pay $X.XX" button — this uses Square's sandbox test card nonce;
   no real money moves.
7. **Verify in Square dashboard (sandbox):**
   - Go to squareupsandbox.com → Orders. Your order should appear as PICKUP.
8. Order Status screen shows "Order received". Tap "Simulate staff updating the
   order" twice → status moves MAKING → READY → shows "Come grab it at the counter!"
9. Check the staff push: if ntfy.sh / Expo push token is set, a notification fires.

If any step fails, copy the red error text and send it here.

## How to run locally / connect Square
See **COMMANDS.md**. Square integration spec: **docs/SQUARE_INTEGRATION.md**.
Secrets live only in `services/backend/.dev.vars` (gitignored) — never commit them.

## Design preview files (not part of the app)
`/home/user/app-preview.html` + `app-screens.html` were throwaway visual mockups.
